from api import ApiClient
import pandas as pd
import csv
from pathlib import Path
from tkinter import filedialog

# Save matrix data to CSV if present


def write_matrix_csv(json_data, out_path):
    # Build ordered list of column ids from matrix (first-seen)
    matrix = json_data.get('matrix') or []
    col_ids = []
    for item in matrix:
        # each item is a dict with single key: name -> {col_id: val}
        for name, inner in item.items():
            for cid in inner.keys():
                if cid not in col_ids:
                    col_ids.append(cid)

    # Use readable column names from json_data['columns'] when possible
    col_names = json_data.get('columns', [])
    # Map col_ids -> col_names by index when lengths match/allow
    header_cols = []
    for idx, cid in enumerate(col_ids):
        if idx < len(col_names):
            header_cols.append(col_names[idx])
        else:
            header_cols.append(cid)

    out_file = Path(out_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with out_file.open('w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['name'] + header_cols)

        for item in matrix:
            for name, inner in item.items():
                row = [name]
                for cid in col_ids:
                    val = inner.get(cid)
                    if val is None:
                        row.append('')
                    elif isinstance(val, bool):
                        row.append('TRUE' if val else 'FALSE')
                    else:
                        row.append(str(val))
                writer.writerow(row)


def main():
    api_client = ApiClient("http://tlaix.smart-food.cc")
    user = input("Email: ")
    password = input("Password: ")
    if not api_client.login(user, password):
        print("Login failed")
        return

    tables = api_client.get_tables()
    print("Tables:\n", '\n'.join(
        [f"{t["id"]} - {t["name"]} - {t["description"]}\n" for t in tables]))

    table_id = input("Table ID: ")

    tabs = api_client.get_tabs(table_id)
    print("Tabs:\n", '\n'.join([f"{t["id"]} - {t["name"]}\n" for t in tabs]))
    table_tab = input("Table Tab: ")
    data = api_client.tabview(table_id, table_tab)
    print(data)

    csv_name = f"tab_{table_id}_{table_tab}.csv"
    write_matrix_csv(data, filedialog.asksaveasfilename(
        defaultextension=".csv", initialfile=csv_name, title="Save CSV"))
    print(f"Saved CSV to {csv_name}")


if __name__ == "__main__":
    main()
