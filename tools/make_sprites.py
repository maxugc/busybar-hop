"""Builds every PNG the Hop app uses, from the pixel grids below.

Run:  python3 tools/make_sprites.py
Writes into src/images/ and src/appmeta/, plus a scaled-up
preview sheet in tools/preview.png so the art can be checked by eye.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "src"
IMAGES = APP / "images"
META = APP / "appmeta"

# One character per pixel. "." is transparent.
PALETTE = {
    # frog: 3 tones of green, light from the top right
    "h": (170, 255, 120),  # highlight
    "G": (60, 200, 70),    # base
    "D": (25, 115, 40),    # shadow
    "B": (210, 245, 150),  # belly
    "W": (255, 255, 255),  # eye white
    "K": (0, 0, 0),        # pupil (an unlit LED)
    "T": (255, 70, 110),   # tongue
    # mushroom
    "r": (255, 130, 110),  # cap highlight
    "R": (230, 40, 30),    # cap base
    "M": (140, 15, 15),    # cap shadow
    "o": (255, 255, 255),  # cap spot
    "s": (245, 225, 185),  # stem
    "S": (170, 140, 100),  # stem shadow
    # rock
    "l": (200, 210, 220),  # rock highlight
    "g": (130, 142, 155),  # rock base
    "d": (70, 80, 92),     # rock shadow
    # bee
    "Y": (255, 205, 30),   # body
    "y": (255, 240, 140),  # body highlight
    "k": (40, 25, 0),      # stripe
    "w": (180, 230, 255),  # wing
    # ground
    "e": (120, 75, 35),    # dirt
    "E": (165, 110, 55),   # dirt speck
    "q": (45, 150, 50),    # grass
    # back icon
    "n": (136, 136, 136),
}

SPRITES = {
    # Frog, 8x7, facing right. Two running frames, one in the air, one hit.
    "frog_run_a": [
        "....hh..",
        "...GWKh.",
        ".GGGGGGh",
        "GGGGGGGG",
        "DGGGGGGG",
        ".DBBBBG.",
        ".DD..DD.",
    ],
    "frog_run_b": [
        "....hh..",
        "...GWKh.",
        ".GGGGGGh",
        "GGGGGGGG",
        "DGGGGGGG",
        ".DBBBBG.",
        "DD....DD",
    ],
    "frog_jump": [
        "....hh..",
        "...GWKh.",
        ".GGGGGGh",
        "GGGGGGGG",
        "DGGGGGGD",
        "DDBBBB.D",
        "D.......",
    ],
    "frog_hit": [
        "....hh..",
        "...GKKh.",
        ".GGGGGGh",
        "GGGGGGGT",
        "DGGGGGGT",
        ".DBBBBG.",
        ".DD..DD.",
    ],
    # Mushroom, 6x6
    "mushroom": [
        ".RRrr.",
        "RoRRor",
        "MMRRRR",
        "..Ss..",
        "..Ss..",
        ".SSss.",
    ],
    # Tall mushroom, 6x7 (the jump rises 7 px, so it must not be taller)
    "mushroom_tall": [
        ".RRrr.",
        "RoRRor",
        "MMRoRR",
        ".MMMM.",
        "..Ss..",
        "..Ss..",
        ".SSss.",
    ],
    # Rock, 7x4
    "rock": [
        "..lll..",
        ".glllg.",
        "dggglgg",
        "ddddggg",
    ],
    # Bee, 6x4, two wing frames
    "bee_a": [
        ".ww...",
        "..ww..",
        "YkYkyY",
        ".kYkY.",
    ],
    "bee_b": [
        "......",
        "..ww..",
        "YkYkyY",
        "wkYkY.",
    ],
}


# Ground tile, 64x2: grass tufts on top, dirt below. The pattern repeats every
# 16 px. Images can't be wider than the 72 px screen, so the game draws two
# tiles side by side and slides both left by 0-15 px.
def ground_tile():
    grass = "".join("q" if x % 16 in (3, 4, 9, 14) else "." for x in range(64))
    dirt = "".join("E" if x % 16 in (1, 6, 12) else "e" for x in range(64))
    return [grass, dirt]


ICON_FRONT = [  # 8x8 frog face, front view
    ".hh..hh.",
    "hWKGGWKh",
    "GGGGGGGh",
    "GGGGGGGG",
    "DGTTTTGG",
    "DGGGGGGG",
    ".DBBBBG.",
    "DD....DD",
]

ICON_BACK = [  # 11x11, one grey: frog face with eyes and a smile cut out
    "...........",
    ".nnn...nnn.",
    "nn.nnnnn.nn",
    "nnnnnnnnnnn",
    "nnnnnnnnnnn",
    "nn.nnnnn.nn",
    "nnn.....nnn",
    "nnnnnnnnnnn",
    ".nnnnnnnnn.",
    "nnn.....nnn",
    "...........",
]


def to_image(rows):
    width = len(rows[0])
    for r in rows:
        assert len(r) == width, rows
    img = Image.new("RGBA", (width, len(rows)), (0, 0, 0, 0))
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c != ".":
                img.putpixel((x, y), PALETTE[c] + (255,))
    return img


def main():
    IMAGES.mkdir(parents=True, exist_ok=True)
    META.mkdir(parents=True, exist_ok=True)
    sprites = dict(SPRITES)
    # The bar caches each image's size by file name. If an image changes size,
    # give it a new name, or the bar keeps using the old size (found when the
    # old 88 px "ground.png" kept being rejected after it became 64 px).
    sprites["floor"] = ground_tile()
    for old in ("grass.png", "ground.png", "floor_half.png", "floor_dirt.png"):
        (IMAGES / old).unlink(missing_ok=True)
    made = {}
    for name, rows in sprites.items():
        img = to_image(rows)
        img.save(IMAGES / f"{name}.png")
        made[name] = img
    to_image(ICON_FRONT).save(META / "icon_front_8x8.png")
    to_image(ICON_BACK).save(META / "icon_back_11x11.png")

    # Preview sheet: every sprite at 10x on a dark background.
    scale = 10
    tiles = [(n, made[n]) for n in SPRITES] + [("icon", to_image(ICON_FRONT)), ("icon_back", to_image(ICON_BACK))]
    w = sum(img.width * scale + 20 for _, img in tiles) + 20
    sheet = Image.new("RGB", (w, 12 * scale + 40), (12, 12, 12))
    x = 20
    for _, img in tiles:
        big = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
        sheet.paste(big, (x, 20), big)
        x += big.width + 20
    sheet.save(ROOT / "tools" / "preview.png")
    print("wrote", len(made), "images, 2 icons, tools/preview.png")


if __name__ == "__main__":
    main()
