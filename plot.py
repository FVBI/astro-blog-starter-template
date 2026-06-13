"""
blindtest_plotter.py
====================
Liest eine Apple Numbers-Datei mit Blindtest-Daten ein und erstellt
automatisch passende Plots je nach "Subject".

Verwendung:
    python blindtest_plotter.py datei.numbers
    python blindtest_plotter.py datei.numbers --subject "Passierte Tomaten"
    python blindtest_plotter.py datei.numbers --output ./plots --no-show

Erwartetes Tabellenformat (erste Zeile = Header):
    Date | ID | Subject | Symbol | Brand | Price | Comment |
    <Bewerter1> | <Bewerter2> | ... | Guest | ⌀ | Sum
"""

import argparse
import sys
import warnings
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np
import pandas as pd
import seaborn as sns
from numbers_parser import Document

warnings.filterwarnings("ignore")

# ── Okabe-Ito Palette (colorblind- & greyscale-safe) ─────────────────────────
OKABE_ITO = [
    "#E69F00",  # orange
    "#56B4E9",  # sky blue
    "#009E73",  # bluish green
    "#F0E442",  # yellow
    "#0072B2",  # blue
    "#D55E00",  # vermillion
    "#CC79A7",  # reddish purple
    # "#000000",  # black
]

# Paul Tol – Muted (10 Farben, weiche Töne, gut für Flächen)
TOL_MUTED = [
    "#CC6677",  # rose
    "#332288",  # indigo
    "#DDCC77",  # sand
    "#117733",  # green
    "#88CCEE",  # cyan
    "#882255",  # wine
    "#44AA99",  # teal
    "#999933",  # olive
    "#AA4499",  # purple
    "#DDDDDD",  # pale grey
]

PALETTE = TOL_MUTED
PALETTE_DESAT = [sns.desaturate(c, 0.75) for c in PALETTE]

# ── Einheitliches Theme ───────────────────────────────────────────────────────
LABEL_SIZE  = 13
TITLE_SIZE  = 14
TICK_SIZE   = 12
EXPORT_DPI  = 300
FIG_SIZE    = (14, 9)

sns.set_theme(style="white", font_scale=1.0)
plt.rcParams.update({
    # "figure.facecolor":      "white",
    # "axes.facecolor":        "white",
    "axes.spines.top":       True,
    "axes.spines.right":     True,
    "axes.spines.left":      True,
    "axes.spines.bottom":    True,
    # "axes.linewidth":        1.2,
    "xtick.direction":       "in",
    "ytick.direction":       "in",
    # "xtick.major.size":      5.0,
    # "ytick.major.size":      5.0,
    # "xtick.minor.size":      3.0,
    # "ytick.minor.size":      3.0,
    # "xtick.major.width":     1.2,
    # "ytick.major.width":     1.2,
    # "xtick.minor.width":     0.8,
    # "ytick.minor.width":     0.8,
    "xtick.top":             True,
    "ytick.right":           True,
    "xtick.labelsize":       TICK_SIZE,
    "ytick.labelsize":       TICK_SIZE,
    "axes.grid":             False,
    "axes.labelsize":        LABEL_SIZE,
    "axes.titlesize":        TITLE_SIZE,
    "axes.titleweight":      "bold",
    # "axes.titlepad":         10,
    # "lines.linewidth":       1.5,
    # "patch.linewidth":       1.2,
    "figure.autolayout":     False,
})

def apply_theme(ax: plt.Axes, xlabel: str = "", ylabel: str = ""):
    """Wendet das einheitliche Theme auf eine Axes-Instanz an."""
    for spine in ax.spines.values():
        spine.set_visible(True)
        spine.set_linewidth(1.2)
        spine.set_color("#000000")
    # Ticks auf allen vier Seiten, nach innen, dynamischer Abstand
    ax.xaxis.set_tick_params(which="major", direction="in",
                              bottom=True, top=True, width=1.2, length=5, labelsize=TICK_SIZE)
    ax.xaxis.set_tick_params(which="minor", direction="in",
                              bottom=True, top=True, width=0.8, length=3)
    ax.yaxis.set_tick_params(which="major", direction="in",
                              left=True, right=True, width=1.2, length=5, labelsize=TICK_SIZE)
    ax.yaxis.set_tick_params(which="minor", direction="in",
                              left=True, right=True, width=0.8, length=3)
    ax.xaxis.set_major_locator(mticker.AutoLocator())
    ax.yaxis.set_major_locator(mticker.AutoLocator())
    ax.yaxis.set_minor_locator(mticker.AutoMinorLocator())
    if xlabel:
        ax.set_xlabel(xlabel, fontsize=LABEL_SIZE, labelpad=6)
    if ylabel:
        ax.set_ylabel(ylabel, fontsize=LABEL_SIZE, labelpad=6)

def rotate_xlabels(ax: plt.Axes, rotation: int = 30):
    """Dreht x-Achsenbeschriftungen für lange Namen."""
    ax.set_xticklabels(ax.get_xticklabels(), rotation=rotation,
                       ha="right", rotation_mode="anchor", fontsize=TICK_SIZE)

# ── Spalten, die keine Bewerter sind ─────────────────────────────────────────
META_COLS = {"Date", "ID", "Subject", "Symbol", "Brand", "Price",
             "Comment", "Guest", "⌀", "Sum", "Σ", "Rank", "Name"}


# ── Numbers einlesen ──────────────────────────────────────────────────────────
def load_numbers(path: str) -> pd.DataFrame:
    doc = Document(path)
    sheet = doc.sheets[0]
    table = sheet.tables[0]

    rows = []
    for row in table.iter_rows():
        rows.append([cell.value for cell in row])

    df = pd.DataFrame(rows[1:], columns=rows[0])
    df.columns = [str(c).strip() if c is not None else "" for c in df.columns]
    df = df.loc[:, df.columns != ""]
    df = df.dropna(how="all")

    for col in df.columns:
        try:
            df[col] = pd.to_numeric(df[col])
        except (ValueError, TypeError):
            pass

    return df


# ── Bewerter-Spalten ermitteln ────────────────────────────────────────────────
def rater_cols(df: pd.DataFrame) -> list[str]:
    return [c for c in df.columns
            if c not in META_COLS and df[c].dtype in (float, int, "float64", "int64")]


# ── Plots ─────────────────────────────────────────────────────────────────────

def plot_bar_sum(df: pd.DataFrame, subject: str, out: Path | None, show: bool):
    """Balkendiagramm: Gesamtpunkte (Sum) pro Marke, aufsteigend sortiert."""
    order  = df.sort_values("Sum", ascending=True)
    colors = [PALETTE_DESAT[i % len(PALETTE_DESAT)] for i in range(len(order))]

    fig, ax = plt.subplots(figsize=FIG_SIZE)
    bars = ax.bar(order["Brand"], order["Sum"],
                  color=colors, edgecolor="black", linewidth=1.0)
    ax.bar_label(bars, fmt="%g", padding=4, fontsize=TICK_SIZE, color="#222")
    ax.set_title(f"{subject} - Gesamtpunkte")
    apply_theme(ax, ylabel="Gesamtpunkte")
    rotate_xlabels(ax)
    fig.tight_layout()
    _save(fig, out, f"{subject}_bar_sum")
    if show:
        plt.show()
    plt.close(fig)


def plot_boxplot(df: pd.DataFrame, subject: str, out: Path | None, show: bool):
    """Boxplot: Bewertungsverteilung pro Marke über alle Bewerter."""
    raters = rater_cols(df)
    long   = df.melt(id_vars=["Brand"], value_vars=raters,
                     var_name="Bewerter", value_name="Punkte")
    long   = long.dropna(subset=["Punkte"])
    order  = df.sort_values("Sum", ascending=True)["Brand"].tolist()
 
    fig, ax = plt.subplots(figsize=FIG_SIZE)
    sns.boxplot(data=long, x="Brand", y="Punkte", order=order,
                palette=PALETTE[:len(order)], linewidth=1.4, whis=(0, 100),
                medianprops=dict(color="#333333", linewidth=2.0),
                showmeans=True,
                meanprops=dict(marker="o", markerfacecolor="white",
                               markeredgecolor="#333333", markersize=7,
                               markeredgewidth=1.8),
                ax=ax)
    sns.stripplot(data=long, x="Brand", y="Punkte", order=order,
                  color="#333333", alpha=0.45, size=5, jitter=True, ax=ax)
 
    ax.set_title(f"{subject} - Bewertungsverteilung")
    ax.set_xlabel("")
    apply_theme(ax, ylabel="Bewertung")
    rotate_xlabels(ax)
    fig.tight_layout()
    _save(fig, out, f"{subject}_boxplot")
    if show:
        plt.show()
    plt.close(fig)


def plot_rater_deviation(df: pd.DataFrame, subject: str, out: Path | None, show: bool):
    """Bewerter mit größter Abweichung vom Gruppenmedian (MAD)."""
    raters       = rater_cols(df)
    score_matrix = df.set_index("Brand")[raters]
    group_median = score_matrix.median(axis=1)

    mad = {}
    for r in raters:
        col = score_matrix[r].dropna()
        if col.empty:
            continue
        aligned = group_median.reindex(col.index)
        mad[r]  = (col - aligned).abs().mean()

    mad_s  = pd.Series(mad).sort_values(ascending=True)
    colors = [PALETTE_DESAT[i % len(PALETTE_DESAT)] for i in range(len(mad_s))]

    fig, ax = plt.subplots(figsize=FIG_SIZE)
    bars = ax.bar(mad_s.index, mad_s.values,
                  color=colors, edgecolor="black", linewidth=1.0)
    ax.bar_label(bars, fmt="%.2f", padding=4, fontsize=TICK_SIZE, color="#222")
    ax.set_title(f"{subject} - Bewerter-Abweichung vom Gruppenmedian")
    apply_theme(ax, ylabel="Mittl. abs. Abweichung")
    fig.tight_layout()
    _save(fig, out, f"{subject}_rater_deviation")
    if show:
        plt.show()
    plt.close(fig)


def plot_price_per_point(df: pd.DataFrame, subject: str, out: Path | None, show: bool):
    """Balkendiagramm: Preis × Sum - niedriger = besser."""
    needed = {"Price", "Sum", "Brand"}
    if not needed.issubset(df.columns):
        print("  [Übersprungen] Preis/Leistung: Spalten 'Price' oder 'Sum' fehlen.")
        return

    sub = df.dropna(subset=["Price", "Sum"]).copy()
    sub = sub[sub["Price"] > 0]
    if sub.empty:
        print("  [Übersprungen] Preis/Leistung: Keine Preisdaten vorhanden.")
        return

    sub["Score"] = sub["Price"] * sub["Sum"]
    sub    = sub.sort_values("Score", ascending=True)
    colors = [PALETTE_DESAT[i % len(PALETTE_DESAT)] for i in range(len(sub))]

    fig, ax = plt.subplots(figsize=FIG_SIZE)
    bars = ax.bar(sub["Brand"], sub["Score"],
                  color=colors, edgecolor="black", linewidth=1.0)
    ax.bar_label(bars, fmt="%.2f", padding=4, fontsize=TICK_SIZE, color="#222")
    ax.set_title(f"{subject} - Preis-Leistungs-Verhältnis")
    apply_theme(ax, ylabel="Preis × Σ  (niedriger = besser)")
    rotate_xlabels(ax)
    fig.tight_layout()
    _save(fig, out, f"{subject}_price_per_point")
    if show:
        plt.show()
    plt.close(fig)


# ── Hilfsfunktionen ───────────────────────────────────────────────────────────

def _save(fig: plt.Figure, out: Path | None, name: str):
    if out:
        out.mkdir(parents=True, exist_ok=True)
        safe = name.replace(" ", "_").replace("/", "-")
        path = out / f"{safe}.png"
        fig.savefig(path, dpi=EXPORT_DPI, bbox_inches="tight")
        print(f"  Gespeichert: {path}")


PLOT_FUNCTIONS = [
    plot_bar_sum,
    plot_boxplot,
    plot_rater_deviation,
    plot_price_per_point,
]


# ── Hauptprogramm ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Blindtest-Plotter für Apple Numbers-Dateien"
    )
    parser.add_argument("file", help="Pfad zur .numbers-Datei")
    parser.add_argument("--subject", "-s", default=None,
                        help="Nur dieses Subject plotten (Standard: alle)")
    parser.add_argument("--output", "-o", default=None,
                        help="Ordner für PNG-Exporte (optional)")
    parser.add_argument("--no-show", action="store_true",
                        help="Plots nicht interaktiv anzeigen")
    args = parser.parse_args()

    out  = Path(args.output) if args.output else None
    show = not args.no_show

    print(f"Lese: {args.file}")
    df = load_numbers(args.file)
    print(f"  {len(df)} Zeilen, Spalten: {list(df.columns)}")

    if "Subject" not in df.columns:
        sys.exit("Fehler: Spalte 'Subject' nicht gefunden.")

    subjects = ([args.subject] if args.subject
                else df["Subject"].dropna().unique().tolist())

    for subj in subjects:
        sub_df = df[df["Subject"] == subj].copy().reset_index(drop=True)
        if sub_df.empty:
            print(f"  Kein Datensatz für Subject '{subj}'")
            continue

        print(f"\nSubject: {subj} ({len(sub_df)} Marken)")
        for fn in PLOT_FUNCTIONS:
            try:
                fn(sub_df, subj, out, show)
            except Exception as e:
                print(f"  [Warnung] {fn.__name__}: {e}")

    print("\nFertig.")


if __name__ == "__main__":
    main()