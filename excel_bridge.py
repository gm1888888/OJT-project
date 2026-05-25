import xlrd
import xlwt
from xlutils.copy import copy
import sys
import json
import os

def populate_excel(template_path, output_path, data):
    # Load the template
    rb = xlrd.open_workbook(template_path, formatting_info=True)
    wb = copy(rb)
    
    # Mapping logic based on research
    sheets = {s.name: i for i, s in enumerate(rb.sheets())}
    
    # 1. Dash Board Mapping
    if "Dash Board" in sheets:
        ws = wb.get_sheet(sheets["Dash Board"])
        # D7: Client Name
        ws.write(6, 3, data.get("client_name", ""))
        # D8: Address Line 1
        ws.write(7, 3, data.get("address_1", ""))
        # D10: Requesting Official
        ws.write(9, 3, data.get("official", ""))

    # 2. Software Mapping
    if "Software" in sheets:
        ws = wb.get_sheet(sheets["Software"])
        # B6: Date
        ws.write(5, 1, data.get("date", ""))
        # B7: Ref No
        ws.write(6, 1, data.get("project_name", ""))
        # F7: Capacity
        ws.write(6, 5, data.get("capacity", ""))

    # 3. Data Logger Mapping (The measurement points)
    if "Data Logger" in sheets:
        ws = wb.get_sheet(sheets["Data Logger"])
        points = data.get("points", [])
        # Starting row for data entry in Data Logger is typically after header (row 11 index 10)
        start_row = 10
        for i, pt in enumerate(points):
            row = start_row + i
            # Column mapping: 1st(0)=B(1), 2nd(120)=D(3), 3rd(240)=F(5)
            ws.write(row, 1, pt.get("s1", 0))
            ws.write(row, 3, pt.get("s2", 0))
            ws.write(row, 5, pt.get("s3", 0))

    # Save the new file
    wb.save(output_path)
    print(f"Excel report generated: {output_path}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python excel_bridge.py '<json_data>'")
        sys.exit(1)
        
    try:
        input_data = json.loads(sys.argv[1])
        template = "Testing Machine Software_revised (1).xls"
        output = f"reports/Report_{input_data.get('id', 'temp')}.xls"
        
        if not os.path.exists("reports"):
            os.makedirs("reports")
            
        populate_excel(template, output, input_data)
    except Exception as e:
        print(f"Error: {str(e)}")
        sys.exit(1)
