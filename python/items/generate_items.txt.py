def clean_items_from_file(input_file="raw_input.txt", output_file="items.txt"):
    with open(input_file, "r", encoding="utf-8") as f:
        lines = [line.strip() for line in f if line.strip()]

    i = 0
    entries = []

    while i < len(lines) - 4:
        name1 = lines[i]
        name2 = lines[i + 1]
        if name1 != name2:
            i += 1
            continue

        rap_line = lines[i + 2]
        rap_val = lines[i + 3]
        price_line = lines[i + 4]
        price_val = lines[i + 5] if i + 5 < len(lines) else ""

        if rap_line.lower() == "rap" and price_line.lower() == "price":
            entry = f"{name1}\nRAP {rap_val}\nPrice ${price_val}\n\n"
            entries.append(entry)
            i += 6
        else:
            i += 1

    with open(output_file, "w", encoding="utf-8") as f:
        f.writelines(entries)

    print(f"[✓] Wrote {len(entries)} items to {output_file}")

# Run the cleaner
if __name__ == "__main__":
    clean_items_from_file()
