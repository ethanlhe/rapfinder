import re

def clean_items_from_file(input_file="raw_input.txt", output_file="items.txt"):
    with open(input_file, "r", encoding="utf-8") as f:
        lines = [line.strip() for line in f if line.strip()]

    entries = []
    i = 0
    while i < len(lines) - 5:
        name1 = lines[i]
        name2 = lines[i + 1]
        rap_label = lines[i + 2].lower()
        rap_val = lines[i + 3]
        price_label = lines[i + 4].lower()
        price_val = lines[i + 5]

        # Ensure it's a valid entry with duplicate name, RAP, and Price labels
        if (
            name1 == name2 and
            rap_label == "rap" and
            price_label == "price" and
            re.match(r'[\d,.]+[KM]?$', rap_val) and
            re.match(r'\$?[\d,]+$', price_val)
        ):
            # Normalize RAP and price formatting
            cleaned_rap = rap_val.upper().replace(" ", "")
            cleaned_price = price_val.replace("$", "").replace(",", "")
            entry = f"{name1}\nRAP {cleaned_rap}\nPrice ${cleaned_price}\n\n"
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
