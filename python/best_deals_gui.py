import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import pandas as pd
import re
import requests
import threading

global_df = None  # Store loaded data globally
rolimons_projected_map = {}  # name -> projected status
rolimons_loaded = False

# --- Smart parser for loose item format ---
def parse_items(text):
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    items = []
    i = 0
    while i < len(lines):
        # Look for a name
        if not lines[i].startswith("RAP") and not lines[i].startswith("Price"):
            name = lines[i]
            rap = None
            price = None
            j = i + 1
            while j < len(lines) and (rap is None or price is None):
                if lines[j].startswith("RAP"):
                    match = re.search(r'([\d.,]+)([MK])', lines[j])
                    if match:
                        num = float(match.group(1).replace(",", ""))
                        multiplier = 1_000 if match.group(2) == 'K' else 1_000_000
                        rap = int(num * multiplier)
                elif lines[j].startswith("Price"):
                    match = re.search(r'\$+([\d,]+)', lines[j])
                    if match:
                        price = int(match.group(1).replace(",", ""))
                j += 1

            if rap is not None and price is not None:
                items.append({'name': name, 'RAP': rap, 'Price': price})
            i = j
        else:
            i += 1
    return pd.DataFrame(items)

# --- Fetch Rolimons data (run in thread) ---
def fetch_rolimons_data(callback=None):
    global rolimons_projected_map, rolimons_loaded
    try:
        resp = requests.get("https://www.rolimons.com/itemapi/itemdetails", timeout=10)
        data = resp.json()
        name_to_projected = {}
        for item in data["items"].values():
            name = item[0].strip().lower()
            projected = item[7] == 1
            name_to_projected[name] = projected
        rolimons_projected_map = name_to_projected
        rolimons_loaded = True
        if callback:
            callback()
    except Exception as e:
        messagebox.showerror("Rolimons API Error", f"Failed to fetch Rolimons data: {e}")
        rolimons_loaded = False
        if callback:
            callback()

# --- Apply filters and update table ---
def apply_filters():
    global global_df, rolimons_projected_map
    if global_df is None:
        messagebox.showinfo("No Data", "Please load an items.txt file first.")
        return
    try:
        max_budget = int(budget_entry.get() or 0)
        min_rap = int(min_rap_entry.get() or 0)
        min_price = int(min_price_entry.get() or 0)
    except ValueError:
        messagebox.showerror("Error", "Please enter valid numbers for all filters")
        return
    
    df = global_df[
        (global_df["Price"] <= max_budget) &
        (global_df["RAP"] >= min_rap) &
        (global_df["Price"] >= min_price)
    ].copy()
    
    if df.empty:
        for item in tree.get_children():
            tree.delete(item)
        status_label.config(text="No items match your filter criteria.")
        return
    
    df["ValueRatio"] = df["RAP"] / df["Price"]
    df = df.sort_values("ValueRatio", ascending=False)
    
    # Add projected status
    def get_proj_status(name):
        if not rolimons_loaded:
            return "?"
        return "Yes" if rolimons_projected_map.get(name.strip().lower(), False) else "No"
    df["Projected"] = df["name"].apply(get_proj_status)

    # Sort: non-projected first, then by Value Ratio
    df = df.sort_values(
        by=["Projected", "ValueRatio"],
        ascending=[True, False],  # Projected 'No' (False) first, then ValueRatio descending
        key=lambda col: col if col.name != "Projected" else col == "Yes"
    )
    
    for item in tree.get_children():
        tree.delete(item)
    for idx, (_, row) in enumerate(df.iterrows()):
        tags = []
        if idx < 3:
            tags.append('best_deal')
        if row["Projected"] == "Yes":
            tags.append('projected')
        item_id = tree.insert("", "end", values=(
            row["name"],
            f"${row['Price']:,}",
            f"${row['RAP']:,}",
            f"{row['ValueRatio']:.2f}",
            row["Projected"]
        ), tags=tuple(tags))
    status_label.config(text=f"Showing {len(df)} items (Max Budget: ${max_budget:,}, Min RAP: ${min_rap:,}, Min Price: ${min_price:,})")

# --- GUI file loader ---
def load_file():
    global global_df, rolimons_loaded
    path = filedialog.askopenfilename(filetypes=[("Text files", "*.txt")])
    if not path:
        return
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = f.read()
        df = parse_items(raw)
        if df.empty:
            messagebox.showinfo("No Items", "No items found in the file.")
            return
        global_df = df
        status_label.config(text="File loaded. Fetching Rolimons data...")
        for item in tree.get_children():
            tree.delete(item)
        # Fetch Rolimons data in a thread, then update status
        def after_fetch():
            status_label.config(text="File loaded. Click 'Search' to view items.")
        if not rolimons_loaded:
            threading.Thread(target=fetch_rolimons_data, args=(after_fetch,), daemon=True).start()
        else:
            after_fetch()
    except Exception as e:
        messagebox.showerror("Error", str(e))

def sort_treeview(col, reverse):
    items = [(tree.set(item, col), item) for item in tree.get_children("")]
    items.sort(reverse=reverse)
    for index, (_, item) in enumerate(items):
        tree.move(item, "", index)
    tree.heading(col, command=lambda: sort_treeview(col, not reverse))

# === UI Setup ===
root = tk.Tk()
root.title("RAP Deal Finder")
root.geometry("1100x600")

frame = ttk.Frame(root, padding="10")
frame.pack(fill=tk.BOTH, expand=True)

controls_frame = ttk.Frame(frame)
controls_frame.pack(fill=tk.X, pady=(0, 10))

ttk.Label(controls_frame, text="Max Budget:").pack(side=tk.LEFT, padx=(0, 5))
budget_entry = ttk.Entry(controls_frame, width=10)
budget_entry.insert(0, "1000")
budget_entry.pack(side=tk.LEFT, padx=(0, 10))

ttk.Label(controls_frame, text="Min RAP:").pack(side=tk.LEFT, padx=(0, 5))
min_rap_entry = ttk.Entry(controls_frame, width=10)
min_rap_entry.insert(0, "0")
min_rap_entry.pack(side=tk.LEFT, padx=(0, 10))

ttk.Label(controls_frame, text="Min Price:").pack(side=tk.LEFT, padx=(0, 5))
min_price_entry = ttk.Entry(controls_frame, width=10)
min_price_entry.insert(0, "0")
min_price_entry.pack(side=tk.LEFT, padx=(0, 10))

ttk.Button(controls_frame, text="Search", command=apply_filters).pack(side=tk.LEFT)
ttk.Button(controls_frame, text="Load items.txt", command=load_file).pack(side=tk.LEFT, padx=(10, 0))

status_label = ttk.Label(controls_frame, text="No items loaded")
status_label.pack(side=tk.RIGHT)

tree = ttk.Treeview(frame, columns=("Name", "Price", "RAP", "Value Ratio", "Projected"), show="headings")
tree.heading("Name", text="Name", command=lambda: sort_treeview("Name", False))
tree.heading("Price", text="Price", command=lambda: sort_treeview("Price", False))
tree.heading("RAP", text="RAP", command=lambda: sort_treeview("RAP", False))
tree.heading("Value Ratio", text="Value Ratio", command=lambda: sort_treeview("Value Ratio", False))
tree.heading("Projected", text="Projected", command=lambda: sort_treeview("Projected", False))
tree.column("Name", width=400)
tree.column("Price", width=150)
tree.column("RAP", width=150)
tree.column("Value Ratio", width=150)
tree.column("Projected", width=100)
tree.tag_configure('best_deal', background='#e6ffe6')
tree.tag_configure('projected', background='#fff7cc')  # Light yellow for projected
scrollbar = ttk.Scrollbar(frame, orient=tk.VERTICAL, command=tree.yview)
tree.configure(yscrollcommand=scrollbar.set)
tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

root.mainloop()
