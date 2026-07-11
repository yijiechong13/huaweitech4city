# Message Preprocessing Spec

**Purpose:** Normalise a single chat message before it is fed to the encoder in a harm-detection model (scam / grooming / cyberbullying). Applied per message.

**Assumption:** Text is English / Singlish only. No Mandarin or Tamil scripts. Any non-Latin look-alike character is therefore treated as obfuscation.

---

## Core principle

- **Normalise identifiers** — Unique, meaningless data points (e.g. phone, url) are replaced with standard placeholders, thus reducing noise. 
- **Preserve style and sentiment** — do NOT lowercase, stem, strip punctuation/emoji, or collapse elongated words (`pleeease`, `!!!`). These carry tone / aggression / urgency signal that are important in the context of cyberbullying

---

## Token inventory

| Token | Represents |
|---|---|
| `[phone]` | Phone number |
| `[url]` | Generic link |
| `[spoofed_link]` | Look-alike link (homoglyph or punycode in the domain) |
| `[handle]` | Contact-redirect handle or link (Telegram / WhatsApp) |
| `[gov]` | Authority name |
| `[bank]` | Bank name |
| `[delivery]` | Delivery name |
| `[platform]` | E-commerce / social platform name |
| `[payment_app]` | Payment service name |
| `[nric]` | NRIC / FIN number |
| `[uen]` | UEN (business PayNow payment target) |
| `[bank_acct]` | Bank account **number** |
| `[wallet]` | Crypto wallet address |
| `[otp]` | OTP / verification code |
| `[money_eN]` | Money amount, bucketed by order of magnitude (see Money rule) |

---

## Pipeline order (follow this sequence)

Order matters: identifiers like phone and NRIC are pulled out first, before the name-matching step, so their digits are already frozen and can't be misread as look-alike letters.

### Step 1 — Extract identifiers (start from most specific → most general)
1. **Contact-redirect handle/link → `[handle]`** — a Telegram/WhatsApp contact point: `t.me/…`, `telegram.me/…`, `wa.me/…`, `api.whatsapp.com/…`, bare `@handle`, or phrases like "whatsapp me at …". Runs before URLs so these are not caught as `[url]`.
2. **URL → `[url]`** — any remaining link. Becomes `[spoofed_link]` instead if the domain looks faked — see Spoofed-link rule.
3. **NRIC / FIN → `[nric]`** — Singapore ID: letter + 7 digits + letter, e.g. `S1234567A`.
4. **UEN → `[uen]`** — business registration number, in any of the three ACRA formats (9- or 10-char).
5. **Crypto wallet → `[wallet]`** — long alphanumeric address, e.g. ETH `0x…`, BTC, TRON `T…`.
6. **OTP / verification code → `[otp]`** — short numeric code near an OTP keyword (`OTP`, `code`, `verification`), e.g. `code 448291`.
7. **Bank account → `[bank_acct]`** — a 7–14 digit number next to an account keyword (`account`, `acct`, `acc`, `a/c`); spaces/dashes allowed. Runs before phone, because both can be 8 digits and the keyword gives account priority.
8. **Phone → `[phone]`** — Singapore number: 8 digits starting with 3/6/8/9, optional `+65` prefix, spaces allowed, e.g. `+65 9123 4567`.
9. **Money → `[money_eN]`** — a monetary amount; must contain an actual number. See Money rule.

### Step 2 — Detect name-based entities
- Authorities / orgs → `[gov]` / `[bank]` / `[delivery]` / `[platform]`
- Payment apps → `[payment_app]`

Matching folds disguises before comparing, so faked names are caught on the raw text with no separate clean-up pass. It ignores case, maps each look-alike character to its Latin letter, and reads look-alike sequences like `rn` as `m`. Examples: `g0v` → `[gov]`, `раypal` → `[payment_app]`, `0CBC` → `[bank]`, `rnaybank` → `[bank]`.

### Step 3 — Leave everything else unchanged
Casing, punctuation, emoji, elongation, and spacing are preserved as-is. Look-alike characters in ordinary (non-name) words are left untouched.

---

## Money rule

**Detection — a number becomes money via either trigger:**

1. **Marked amount** — carries a currency marker (`$`, `S$`, `SGD`) or a magnitude suffix `k`/`m`/`mil` (`5k` → 5000, `2m` → 2,000,000). Matched anywhere; no keyword needed.
2. **Keyword-gated bare number** — a plain number with no marker, sitting within ~30 characters of a money keyword (`pay`, `transfer`, `salary`, `refund`, `deposit`, `fee`, …). `transfer 5000 tonight` → `[money_e3]`.
   - **Not money:** a bare number followed by a time/count unit (`10 minutes`, `24 hours`, `63 years`, `3 months`) or `%` — left unchanged even next to a money keyword.

**Normalisation — for either trigger:**

3. Parse to a number: `5k`/`5K` → 5000, `$5,000`/`SGD 5000` → 5000. Assume SGD; ignore the currency symbol/code.
4. Bucket by order of magnitude: `N = clamp(floor(log10(amount)), 0, 6)`.
5. Emit `[money_eN]`.

Examples: `$5 → [money_e0]`, `$50 → [money_e1]`, `$5,000 → [money_e3]`, `$500,000 → [money_e5]`, `$5,000,000 → [money_e6]`.

---

## Spoofed-link rule

A link found in Step 1.2 becomes `[spoofed_link]` (instead of `[url]`) when its text shows a look-alike domain signal:

1. **Homoglyph character** — a non-Latin look-alike (Cyrillic / Greek) anywhere in the link, e.g. `http://раypal.com` (Cyrillic `р`, `а`). Per the English/Singlish assumption, any such character in a link is treated as spoofing.
2. **Punycode** — the link contains `xn--`. Browsers store non-Latin domains in this ASCII form, so its presence means the visible domain used look-alike characters. Example: `pаypal.com` (Cyrillic `а`) is stored as `https://xn--pypal-4ve.com`.
3. **Fold-created brand** — undo common disguises in the domain (`0→o`, `1→l`/`1→i`, `rn→m`, homoglyphs) and check if the result spells a known brand that the original did **not**. If it does, the domain was faking that brand. Example: `paypa1.com` folds to `paypal.com` (a brand → spoof); `learn.com` folds to itself (no brand → safe). Brands come from the Step-2 lookup names plus a curated global list (`SPOOF_BRANDS` in `lexicons.py`). Requiring the fold to create the brand keeps innocent domains and domains that already carry the brand as-is out.

Otherwise the link stays `[url]`.

---

## Disambiguation notes

- **`[bank]` vs `[bank_acct]`** — `[bank]` is a bank NAME as impersonated sender (`DBS`, `OCBC`). `[bank_acct]` is an actual account NUMBER. Different tokens.
- **Overlapping numeric / alphanumeric IDs** — order of resolution (most specific first): NRIC/FIN → UEN → wallet → OTP (keyword) → bank account (keyword `account/acct/acc/a/c`, 7–14 digits) → phone (8 digits, first digit 3/6/8/9). Account before phone because both can be 8 digits; the keyword gives account priority.
- **Money `$` needs digits** — `$` with no adjacent number (e.g. `pa$$word`) is not money; leave it unchanged.
- **Lookup lists** — keep org/payment names as extensible, case-insensitive lookup lists. Seed examples:
  - `gov`: SPF, MOM, ICA, CPF, IRAS, MAS, MOH — abbreviations **and** full names (e.g. "Singapore Police Force", "Ministry of Manpower"), plus Police, Singpass, gov, govt. (`MOM` matches all-caps only, so the word "mom" is left alone.)
  - `bank`: DBS, POSB, OCBC, UOB, United Overseas Bank, Standard Chartered, Citibank, Trust, GXS, Maybank
  - `delivery`: SingPost, SpeedPost, Ninja Van, J&T, DHL
  - `platform`: Shopee, Lazada, Carousell, Grab, Facebook, Instagram
  - `payment_app`: PayNow, PayLah, GrabPay, PayPal, ShopeePay, YouTrip, Revolut, Wise
- **Deliberately excluded from the lookup lists** (would over-match, or handled elsewhere):
  - `courier` — too common a word; excluded from `delivery`.
  - `WhatsApp` / `Telegram` — contact-redirect targets, so bare mentions become `[handle]` (via links/phrases), never `[platform]`.
  - `gov.sg` — a bare domain, so it is claimed as `[url]` in Step 1, not `[gov]`.

---

## Worked example

**Input:**
```
URGENT!! Your DBS acc is locked. Verify at http://dbs-secure.xyz with OTP 887210 or pay $5,000 to acc 123456789. Whatsapp me @scammer_help
```

**Output:**
```
URGENT!! Your [bank] acc is locked. Verify at [url] with OTP [otp] or pay [money_e3] to acc [bank_acct]. Whatsapp me [handle]
```

Note: `URGENT!!`, casing, and `!!` are preserved.

---

## Code layout

| File | Purpose |
|---|---|
| `pipeline.py` | Entry point — `preprocess_message()` runs the steps in spec order |
| `segments.py` | Segment machinery — emitted tokens are frozen so later steps can't touch them |
| `identifiers.py` | Step 1 — extracts identifiers (handles, URLs, NRIC, …, money) |
| `spoofing.py` | Spoofed-link rule — decides `[url]` vs `[spoofed_link]` |
| `entities.py` | Step 2 — homoglyph-tolerant entity name tagging |
| `patterns.py` | Compiled Step-1 regexes |
| `lexicons.py` | Data only — lookup names, keyword lists, homoglyph/fold maps |
| `test_pipeline.py` | Spec-conformance tests; not part of the pipeline |

`__init__.py` re-exports `preprocess_message` as the package's public API.
