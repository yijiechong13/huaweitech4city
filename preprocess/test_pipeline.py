"""Spec-conformance tests for preprocess_message. Run with pytest, or directly:
python3 preprocess/test_pipeline.py"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from preprocess import preprocess_message as p


def test_worked_example():
    src = ("URGENT!! Your DBS acc is locked. Verify at http://dbs-secure.xyz with "
           "OTP 887210 or pay $5,000 to acc 123456789. Whatsapp me @scammer_help")
    exp = ("URGENT!! Your [bank] acc is locked. Verify at [url] with "
           "OTP [otp] or pay [money_e3] to acc [bank_acct]. Whatsapp me [handle]")
    assert p(src) == exp


def test_money_buckets():
    assert p("pay $5") == "pay [money_e0]"
    assert p("pay $50") == "pay [money_e1]"
    assert p("pay $5,000") == "pay [money_e3]"
    assert p("pay $500,000") == "pay [money_e5]"
    assert p("pay $5,000,000") == "pay [money_e6]"
    assert p("pay SGD 4,500.00 now") == "pay [money_e3] now"
    assert p("just 5k only") == "just [money_e3] only"
    assert p("earn 10k monthly") == "earn [money_e4] monthly"
    assert p("$0.50 top up") == "[money_e0] top up"


def test_money_bare_context_gated():
    assert p("can transfer 5000 tonight") == "can transfer [money_e3] tonight"
    assert p("wait 10 minutes") == "wait 10 minutes"
    assert p("see you at 8") == "see you at 8"
    # unit-suffixed numbers are time/count, not money, even near money keywords
    assert p("pay the fee within 24 hours") == "pay the fee within 24 hours"
    assert p("I'm 63 years old and my fees due") == "I'm 63 years old and my fees due"
    assert p("send your latest 3 months' payslips") == "send your latest 3 months' payslips"


def test_identifiers():
    assert p("my nric is S1234567A") == "my nric is [nric]"
    assert p("PayNow to 201912345A") == "[payment_app] to [uen]"
    assert p("UEN T09LL0001B ok") == "UEN [uen] ok"
    assert p("call me at 91234567") == "call me at [phone]"
    assert p("call +65 8123 4567") == "call [phone]"
    assert p("transfer to acc 123456789") == "transfer to acc [bank_acct]"
    assert p("your account ending 8821") == "your account ending 8821"  # 4 digits: too short
    assert p("Your verification code is 482913") == "Your verification code is [otp]"
    assert p("send to 0x" + "a1" * 20) == "send to [wallet]"
    # alphanumeric IDs (parcel codes) never match phone/otp
    assert p("parcel SG66493012 is on hold") == "parcel SG66493012 is on hold"
    assert p("tracking code SG66493012 here") == "tracking code SG66493012 here"


def test_handles_urls_emails():
    assert p("join t.me/scam123 now") == "join [handle] now"
    assert p("Whatsapp me at 91234567") == "Whatsapp me at [handle]"
    assert p("dm @scam_bot ok") == "dm [handle] ok"
    assert p("mail john.doe@gmail.com") == "mail john.doe@gmail.com"  # emails untouched
    assert p("verify at dbs-secure.xyz now") == "verify at [url] now"
    assert p("visit gov.sg for info") == "visit [url] for info"  # bare domain wins
    assert p("click https://ocbc-secure-verify.com/cancel.") == "click [url]."


def test_spoofed_links():
    # Cyrillic homoglyph in the domain → spoofed
    assert p("login at http://раypal.com now") == "login at [spoofed_link] now"
    # punycode (encoded look-alike) → spoofed
    assert p("go to https://xn--pypal-4ve.com") == "go to [spoofed_link]"
    # ASCII fold creates a brand the raw domain lacks → spoofed
    assert p("login at rnicrosoft.com now") == "login at [spoofed_link] now"  # rn → m
    assert p("go to https://paypa1.com/verify") == "go to [spoofed_link]"  # 1 → l
    assert p("use s1ngpass.sg here") == "use [spoofed_link] here"  # 1 → i
    # brand already present as-is: stays [url] (official-domain check on hold)
    assert p("verify at dbs-secure.xyz now") == "verify at [url] now"
    assert p("click https://ocbc-secure-verify.com") == "click [url]"
    # innocent rn/digit domains fold to nothing brand-like
    assert p("more at learn.com") == "more at [url]"
    assert p("see burnley10.net") == "see [url]"


def test_entities_and_obfuscation():
    assert p("OCBC: alert") == "[bank]: alert"
    assert p("use раypal to pay") == "use [payment_app] to pay"  # Cyrillic homoglyphs
    assert p("the g0v sent you a fine") == "the [gov] sent you a fine"
    assert p("Pay1ah works") == "[payment_app] works"  # 1 matches l in lookup
    assert p("rnaybank alert") == "[bank] alert"  # rn reads as m (kerning spoof)
    assert p("found on instagrarn") == "found on [platform]"
    assert p("modern warning") == "modern warning"  # plain rn words untouched
    assert p("bank with Trust today") == "bank with [bank] today"
    assert p("i trust you lah") == "i trust you lah"  # strict case only
    assert p("book a Grab home") == "book a [platform] home"
    assert p("use GrabPay please") == "use [payment_app] please"  # GrabPay beats Grab


def test_style_preserved():
    assert p("pleeease 😭!! DON'T") == "pleeease 😭!! DON'T"
    assert p("on 24/06 at 10:30") == "on 24/06 at 10:30"  # digit-only strings kept
    assert p("you can 10x easily") == "you can 10x easily"  # edge digits not folded
    assert p("came 1st at 10pm") == "came 1st at 10pm"
    assert p("she in JC1 this year") == "she in JC1 this year"
    assert p("saw it at Token2049") == "saw it at Token2049"
    assert p("0CBC alert") == "[bank] alert"  # leading look-alike still caught pre-fold


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in fns:
        fn()
        print(f"ok  {fn.__name__}")
    print(f"{len(fns)} test groups passed")
