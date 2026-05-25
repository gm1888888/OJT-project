import xlrd
import json

def detail_data_logger(file_path):
    workbook = xlrd.open_workbook(file_path, formatting_info=True)
    if "Data Logger" not in workbook.sheet_names():
        print("Sheet 'Data Logger' not found.")
        return
    
    sheet = workbook.sheet_by_name("Data Logger")
    rows_to_dump = min(100, sheet.nrows)
    cols_to_dump = min(50, sheet.ncols)
    data = []
    
    for r in range(rows_to_dump):
        row_cells = []
        for c in range(cols_to_dump):
            cell = sheet.cell(r, c)
            # xlrd cell types: 1=text, 2=number, 3=date, 4=bool, 5=error, 6=blank
            cell_type = cell.ctype
            cell_value = cell.value
            row_cells.append({"v": cell_value, "t": cell_type})
        data.append(row_cells)
        
    print(json.dumps(data))

if __name__ == "__main__":
    detail_data_logger("Testing Machine Software_revised (1).xls")
