"""Codeword puzzle generator.

Builds 13x13 codeword grids: a lattice template (blocks at odd-odd cells) plus
random word-splitting blocks, filled with dictionary words by backtracking.
Only fills that use ALL 26 letters are kept (a codeword's letter key needs the
whole alphabet). Output: tools/codeword_data.json — a JSON array of grids,
each "ROW/ROW/..." with '#' for blocks and uppercase letters elsewhere.

Run:  py tools/gen_codeword.py
"""
import json
import random
import sys
import urllib.request
from pathlib import Path

N = 13
TARGET_PUZZLES = 60
MAX_ATTEMPTS_PER_PUZZLE = 400
NODE_CAP = 30000

WORDLIST_URL = ("https://raw.githubusercontent.com/first20hours/"
                "google-10000-english/master/google-10000-english-usa-no-swears.txt")

# webby tokens / abbreviations that read as junk inside a puzzle
JUNK = set("""
www http https com org net edu gov mil int href html htm php asp aspx jsp cgi
xml css js img src alt gif jpg jpeg png pdf zip exe dll ftp smtp pop imap dns
tcp udp url uri api sdk os pc ios cd dvd usb ram rom cpu gpu lcd crt kb mb gb
tb hz ghz mhz faq sitemap login logout username password admin webmaster
homepage website webpage email inbox spam blog forum thread poster repost
online offline download upload click subscribe unsubscribe rss feed wiki etc
inc ltd llc corp dept govt assn intl natl misc info svc svcs gmt utc est cst
mst pst edt cdt mdt pdt jan feb mar apr jun jul aug sep sept oct nov dec mon
tue tues wed thu thur thurs fri sat sun lol omg btw fyi aka asap diy faqs ie
eg vs ok pm am dr mr mrs ms jr sr st rd th nd aspx ascii ssl tls vpn lan wan
sql gui ide pda gps sms mms isp ascii utf iso ansi ieee acm
zdnet skype ebay yahoo google msn aol cnet paypal netscape microsoft adobe
nokia sony dell intel cisco oracle novell xerox verizon motorola samsung
toshiba panasonic kodak epson fujitsu siemens philips sanyo hitachi casio
xbox ipod ipad iphone itunes macintosh netflix flickr youtube facebook
twitter myspace linkedin wordpress gmail hotmail espn hulu tivo photoshop
winamp frontpage realtek logitech compaq lexmark gateway? mozilla firefox
""".split())

# the web word list is full of 3-letter abbreviations (ids, des, gis, wav...);
# short words come from this curated list instead so every entry is deducible
THREE = set("""
ace act add age ago aid aim air ale all and ant any ape apt arc are arm art
ash ask ate awe axe bad bag ban bar bat bay bed bee beg bet bid big bin bit
boa bog boo bow box boy bud bug bun bus but buy cab can cap car cat cow cry
cub cue cup cut dad dam day den dew did die dig dim dip dog dot dry dub dud
due dug duo dye ear eat ebb eel egg ego elf elk elm end era eve eye fan far
fat fax fee few fig fin fit fix flu fly foe fog for fox fry fun fur gap gas
gel gem get gig gin got gum gun gut guy gym had ham has hat hay hen her hid
him hip his hit hog hop hot how hub hue hug hum hut ice icy ill ink inn ion
its ivy jam jar jaw jet jig job jog jot joy jug key kid kin kit lab lad lag
lap law lay leg let lid lie lip lit log lot low mad man map mat may men met
mix mob mop mud mug nap net new nil nod nor not now nun nut oak oar odd off
oil old one orb ore our out owe owl own pad pan paw pay pea peg pen pet pie
pig pin pit ply pod pop pot pry pub pun pup put rag ram ran rap rat raw ray
red rib rid rim rip rob rod rot row rub rug rum run rye sad sag sap saw say
sea set sew she shy sin sip sir sit six ski sky sly sob son sow soy spa spy
sum sun tab tag tan tap tar tax tea ten the tie tin tip toe ton top toy try
tub tug two use van vat vet vow wag war was wax way web wed wet who why wig
win wit woe wok won woo yak yam yes yet yew you zip zoo
""".split())


def load_words():
    raw = urllib.request.urlopen(WORDLIST_URL, timeout=30).read().decode()
    words, seen = list(THREE), set(THREE)
    for w in raw.split():
        w = w.strip().lower()
        if not w.isalpha() or not (4 <= len(w) <= 9):
            continue
        if w in JUNK or w in seen:
            continue
        if not any(ch in "aeiouy" for ch in w):
            continue
        seen.add(w)
        words.append(w)
    return words


# split patterns for a 13-cell line; block positions land on ODD indices only,
# so across-splits never cut down words and vice versa
SINGLES = [(3, 9), (5, 7), (7, 5), (9, 3)]
DOUBLES = [(3, 3, 5), (3, 5, 3), (5, 3, 3)]


def line_blocks(rng):
    parts = rng.choice(SINGLES) if rng.random() < 0.55 else rng.choice(DOUBLES)
    blocks, pos = [], 0
    for p in parts[:-1]:
        pos += p
        blocks.append(pos)
        pos += 1
    return blocks


def make_template(rng):
    block = [[(r % 2 == 1 and c % 2 == 1) for c in range(N)] for r in range(N)]
    for r in range(0, N, 2):
        for b in line_blocks(rng):
            block[r][b] = True          # across split: even row, odd col
    for c in range(0, N, 2):
        for b in line_blocks(rng):
            block[b][c] = True          # down split: odd row, even col
    return block


def find_slots(block):
    slots = []
    for r in range(0, N, 2):
        c = 0
        while c < N:
            if block[r][c]:
                c += 1
                continue
            c0 = c
            while c < N and not block[r][c]:
                c += 1
            if c - c0 >= 3:
                slots.append(tuple((r, cc) for cc in range(c0, c)))
    for c in range(0, N, 2):
        r = 0
        while r < N:
            if block[r][c]:
                r += 1
                continue
            r0 = r
            while r < N and not block[r][c]:
                r += 1
            if r - r0 >= 3:
                slots.append(tuple((rr, c) for rr in range(r0, r)))
    return slots


def build_index(words):
    by_len, index = {}, {}
    for w in words:
        by_len.setdefault(len(w), []).append(w)
        for i, ch in enumerate(w):
            index.setdefault((len(w), i, ch), set()).add(w)
    return by_len, index


RARE = set("qzjxkvw")


def attempt_fill(slots, by_len, index, rng):
    grid = {}
    used = set()
    nodes = [0]

    def candidates(slot):
        fixed = [(i, grid[cell]) for i, cell in enumerate(slot) if cell in grid]
        L = len(slot)
        if not fixed:
            pool = by_len.get(L, [])
            return [w for w in pool if w not in used]
        sets = [index.get((L, i, ch), set()) for i, ch in fixed]
        if not all(sets):
            return []
        pool = set.intersection(*sets) if len(sets) > 1 else sets[0]
        return [w for w in pool if w not in used]

    def solve(remaining):
        nodes[0] += 1
        if nodes[0] > NODE_CAP:
            raise TimeoutError
        if not remaining:
            return True
        # most-constrained slot first
        best_i, best_cands = -1, None
        for i, slot in enumerate(remaining):
            cands = candidates(slot)
            if best_cands is None or len(cands) < len(best_cands):
                best_i, best_cands = i, cands
                if not cands:
                    return False
                if len(cands) == 1:
                    break
        slot = remaining[best_i]
        rest = remaining[:best_i] + remaining[best_i + 1:]
        present = set(grid.values())
        missing = set("abcdefghijklmnopqrstuvwxyz") - present

        def rank(w):
            gain = sum((4 if ch in RARE else 1) for ch in set(w) if ch in missing)
            return -gain + rng.random() * 2.0

        best_cands.sort(key=rank)
        for w in best_cands[:24]:           # beam: keeps the search fast
            placed = []
            ok = True
            for cell, ch in zip(slot, w):
                if cell in grid:
                    if grid[cell] != ch:
                        ok = False
                        break
                else:
                    grid[cell] = ch
                    placed.append(cell)
            if ok:
                used.add(w)
                if solve(rest):
                    return True
                used.discard(w)
            for cell in placed:
                del grid[cell]
        return False

    try:
        if not solve(list(slots)):
            return None
    except TimeoutError:
        return None
    if set(grid.values()) != set("abcdefghijklmnopqrstuvwxyz"):
        return None
    return grid


def main():
    rng = random.Random(20260611)
    print("downloading word list...", flush=True)
    words = load_words()
    print(f"{len(words)} usable words", flush=True)
    by_len, index = build_index(words)

    puzzles, seen_grids = [], set()
    attempt = 0
    while len(puzzles) < TARGET_PUZZLES and attempt < TARGET_PUZZLES * MAX_ATTEMPTS_PER_PUZZLE:
        attempt += 1
        block = make_template(rng)
        slots = find_slots(block)
        grid = attempt_fill(slots, by_len, index, rng)
        if grid is None:
            continue
        rows = []
        for r in range(N):
            row = "".join("#" if block[r][c] else grid[(r, c)].upper() for c in range(N))
            rows.append(row)
        key = "/".join(rows)
        if key in seen_grids:
            continue
        seen_grids.add(key)
        puzzles.append(key)
        print(f"puzzle {len(puzzles)}/{TARGET_PUZZLES} (attempt {attempt})", flush=True)

    out = Path(__file__).parent / "codeword_data.json"
    out.write_text(json.dumps(puzzles, separators=(",", ":")))
    print(f"wrote {len(puzzles)} puzzles to {out}", flush=True)
    if len(puzzles) < TARGET_PUZZLES:
        sys.exit(1)


if __name__ == "__main__":
    main()
