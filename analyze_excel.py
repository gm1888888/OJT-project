import xlrd
import json

def analyze_excel(file_path):
    workbook = xlrd.open_workbook(file_path, formatting_info=True)
    analysis = {
        "sheets": [],
        "named_ranges": []
    }
    
    for sheet_name in workbook.sheet_names():
        sheet = workbook.sheet_by_name(sheet_name)
        sheet_info = {
            "name": sheet_name,
            "rows": sheet.nrows,
            "cols": sheet.ncols,
            "sample_data": []
        }
        
        # Grab first 10x10 as sample
        for r in range(min(10, sheet.nrows)):
            row_data = []
            for c in range(min(10, sheet.ncols)):
                cell = sheet.cell(r, c)
                row_data.append(str(cell.value))
            sheet_info["sample_data"].append(row_data)
        
        analysis["sheets"].append(sheet_info)
        
    # Get named ranges (often used in formulas)
    for name_obj in workbook.name_map.values():
        for name in name_obj:
            analysis["named_ranges"].append(name.name)

    print(json.dumps(analysis, indent=2))

if __name__ == "__main__":
    analyze_excel("Testing Machine Software_revised (1).xls")
