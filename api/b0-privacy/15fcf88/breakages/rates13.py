# Exact chance that random base64url text (the canonical text of n random bytes, the last character
# holding only the bits the bytes fill) holds each date form the leak scanner leaves out of, or puts
# into, its checks on a cursor's own text. A pattern is a list of sets of characters, one set per
# position; the chance is computed over the states of all the pattern's partial matches, so it is
# exact, not a union bound. Used for PR #27's twelfth review (scanner.ts: OWN_DATE's doc).
# Usage: python3 rates13.py
from fractions import Fraction as F

B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
D = set("0123456789")
SEP = {"-", "_"}
M = {"0", "1"}  # a month's first digit
DY = {"0", "1", "2", "3"}  # a day's first digit
M1 = set("123456789")
TWENTY = [{"2"}, {"0"}, D, D]  # a year in this century


def chars_dist(n):
    """Per position, the characters base64url's text of n random bytes can have there, each as likely."""
    nchars = (n * 8 + 5) // 6
    rem = (n * 8) % 6  # bits the last character holds
    dists = []
    for i in range(nchars):
        if i == nchars - 1 and rem:
            allowed = [B64[k] for k in range(0, 64, 1 << (6 - rem))]
        else:
            allowed = list(B64)
        dists.append({c: F(1, len(allowed)) for c in allowed})
    return dists


def prob_match(patterns, n):
    """The chance that the text holds a match of any of the patterns."""
    states = {frozenset(): F(1)}
    matched = F(0)
    for dist in chars_dist(n):
        new = {}
        for state, p in states.items():
            for c, pc in dist.items():
                nxt = set()
                hit = False
                for pi, pos in list(state) + [(pi, 0) for pi in range(len(patterns))]:
                    if c in patterns[pi][pos]:
                        if pos + 1 == len(patterns[pi]):
                            hit = True
                        else:
                            nxt.add((pi, pos + 1))
                if hit:
                    matched += p * pc
                else:
                    key = frozenset(nxt)
                    new[key] = new.get(key, F(0)) + p * pc
        states = new
    return matched


A = TWENTY + [SEP]
FORMS = {
    "OWN_DATE (the forms looked for)": [A + [M, D, SEP, DY, D], TWENTY + [M, D, DY, D, {"T", "t"}, D, D, D, D]],
    "day-first, 06-11-2026 (left out)": [[DY, D, SEP, M, D, SEP] + TWENTY],
    "month-first, 11-06-2026 (left out)": [[M, D, SEP, DY, D, SEP] + TWENTY],
    "compact, 20261106 (left out)": [TWENTY + [M, D, DY, D]],
    "a month and day of one or two digits (breakage 253's pattern; left out)": [
        A + [D, SEP, D],
        A + [D, D, SEP, D],
        A + [D, SEP, D, D],
        A + [D, D, SEP, D, D],
    ],
}

for n in (24, 32, 48):
    print(f"{n} random bytes")
    for name, patterns in FORMS.items():
        print(f"  {name}: once in {float(1 / prob_match(patterns, n)):.3g} handles")
