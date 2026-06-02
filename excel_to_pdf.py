import sys
import os
import xlwings as xw

def convert_to_pdf(excel_path, pdf_path):
    # Ensure absolute paths
    excel_path = os.path.abspath(excel_path)
    pdf_path = os.path.abspath(pdf_path)
    
    app = xw.App(visible=False)
    try:
        wb = app.books.open(excel_path)
        sheet = wb.sheets['Data']
        # AUTHORITATIVE FIX: Restore natural multi-page pagination
        sheet.api.PageSetup.Zoom = False
        sheet.api.PageSetup.FitToPagesWide = 1
        sheet.api.PageSetup.FitToPagesTall = False # Allow 2+ pages
        
        sheet.api.ExportAsFixedFormat(0, pdf_path)
        wb.close()
        print(f"PDF generated: {pdf_path}")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        app.quit()

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python excel_to_pdf.py <excel_file> <pdf_file>")
        sys.exit(1)
    convert_to_pdf(sys.argv[1], sys.argv[2])
