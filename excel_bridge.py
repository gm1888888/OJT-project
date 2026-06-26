import xlwings as xw
import sys
import json
import os

def populate_new_format(template_path, output_path, data):
    template_path = os.path.abspath(template_path)
    output_path = os.path.abspath(output_path)
    app = xw.App(visible=False, add_book=False)
    app.display_alerts = False
    app.screen_updating = False
    try:
        wb = app.books.open(template_path)
        ws = wb.sheets["Data"]
        
        # 0. Header & Footer Branding Updates (Size 8)
        ws.api.PageSetup.LeftHeader = "&8DMP41 FORCE CALIBRATION SOFTWARE\nVer. 1 Rev.0"
        ws.api.PageSetup.RightHeader = "" 
        ws.api.PageSetup.CenterHeader = ""
        ws.api.PageSetup.LeftFooter = "Page &P of &N"
        ws.api.PageSetup.CenterFooter = "&8Copyright  @ 2026. All rights reserved."
        ws.api.PageSetup.RightFooter = "&8Date reported: &D\n&T"
        
        # --- PAGE 1 VERTICAL SPACE RECLAMATION ---
        # The reference layout requires slightly more room at the bottom of Page 1.
        # Reduce margins slightly from 0.75" to 0.5" (36 points) to reclaim space naturally.
        ws.api.PageSetup.TopMargin = 36.0
        ws.api.PageSetup.BottomMargin = 36.0
        ws.api.PageSetup.HeaderMargin = 18.0
        
        # Use autofit for header rows instead of fixed heights
        ws.range("17:17").rows.autofit()
        ws.range("24:24").rows.autofit()
        
        unit_scale = data.get("unit_scale", 0.00980665)
        output_unit = data.get("output_unit", "kgf")
        
        FMT_MVV = "0.0000000"
        FMT_FORCE_2 = "0.00"
        FMT_FORCE_4 = "0.0000"
        FMT_FORCE_5 = "0.00000"
        FMT_UNC_COMP = "0.000000"
        FMT_UNC_EXP = "0.000"
        FMT_ERROR = "0.00"
        FMT_ENV = "0.0"
        FMT_SCI = "0.000000E+00"
        
        def write_cell(cell_ref, val, fmt=None, align='center'):
            rng = ws.range(cell_ref)
            if val is None or val == "" or val == "- -": rng.value = ""
            else:
                rng.value = val
                if fmt: rng.number_format = fmt
            if align == 'left': rng.api.HorizontalAlignment = -4131 
            elif align == 'center': rng.api.HorizontalAlignment = -4108 
            elif align == 'right': rng.api.HorizontalAlignment = -4152 

        # 1. Project & Customer Metadata
        write_cell("D2", data.get("client_name"), align='left')
        address = data.get("client_address") or ""
        addr_lines = [line.strip() for line in address.split('\n') if line.strip()]
        write_cell("D3", addr_lines[0] if len(addr_lines) > 0 else "", align='left')
        write_cell("D4", " ".join(addr_lines[1:]) if len(addr_lines) > 1 else "", align='left')
        write_cell("D5", data.get("date"), align='left')
        write_cell("K5", data.get("mode") or "Compression")
        write_cell("D6", data.get("project_name"), align='left')
        # Use alphanumeric capacity if available, fallback to capacity_kgf
        cap_val = data.get("capacity_text") or data.get("capacity")
        write_cell("K6", cap_val)
        write_cell("D7", data.get("instrument"), align='left')
        
        # FIX: Ensure Range field is not clipped horizontally or vertically
        # Add a leading space to act as left-padding if the string exists
        range_val = data.get("range")
        if range_val and isinstance(range_val, str) and not range_val.startswith(" "):
            range_val = " " + range_val
            
        write_cell("K7", range_val, align='left')
        ws.range("7:7").row_height = 18.0 # Increased vertical room

        write_cell("D9", data.get("lc_make"), align='left')
        write_cell("D10", data.get("lc_sn"), align='left')
        write_cell("K9", data.get("increment"), align='left')
        write_cell("K10", data.get("resolution"), align='left')
        write_cell("D12", data.get("ind_make"), align='left')
        write_cell("D13", data.get("ind_sn"), align='left')

        # 2. Dynamic Table Management
        measured = data.get("measured", [])
        results = data.get("results", [])
        num_points = len(measured)
        extra_rows = max(0, num_points - 11)
        
        # RESTORE TEMPLATE DEFAULTS: Remove manual row shrinking. Use template heights.
        if extra_rows > 0:
            for _ in range(extra_rows): 
                ws.range("36:36").api.Insert()
                ws.range("36:36").row_height = 15.0
            t5_ins = 57 + extra_rows
            for _ in range(extra_rows): 
                ws.range(f"{t5_ins}:{t5_ins}").api.Insert()
                ws.range(f"{t5_ins}:{t5_ins}").row_height = 11.45 # Match T5 data rows
            t6_ins = 74 + 2 * extra_rows
            for _ in range(extra_rows): 
                ws.range(f"{t6_ins}:{t6_ins}").api.Insert()
                ws.range(f"{t6_ins}:{t6_ins}").row_height = 15.0
            t8_ins = 89 + 3 * extra_rows
            for _ in range(extra_rows): 
                ws.range(f"{t8_ins}:{t8_ins}").api.Insert()
                ws.range(f"{t8_ins}:{t8_ins}").row_height = 15.0

        T2_START = 18
        T3_START = 25
        T4_START = 39 + extra_rows
        T5_START = 57 + extra_rows
        T6_7_START = 74 + 2*extra_rows
        T8_START = 89 + 3*extra_rows
        FOOTER_START = 101 + 4*extra_rows
        
        # Overwrite hardcoded unit headers with dynamic output unit
        ws.range("B15").value = f"2.) PRE-LOADING DATA, {output_unit}"
        ws.range("B22").value = f"3.) MEASURED DATA, {output_unit}"
        # We need to write to the exact header cells to overwrite "kgf" or "units in kN"
        # Table 3 Target Force header
        # The original template expects the text in row 24, not 23.
        # Do not use api.Merge() as it destroys the pre-existing table borders.
        ws.range("C23").value = ""
        ws.range("C24").value = "Expected Machine Indication"
        
        ws.range("K23").value = ""
        ws.range("K24").value = "Mean Force"
        
        # Table 5 header
        ws.range(f"B{T5_START - 3}").value = f"5.) Net value (dij) & Mean Value (di) Calculation, units in {output_unit}"
        
        # Table 5 column headers (Row T5_START - 1)
        ws.range((T5_START - 1, 3)).value = f"Force                                  ({output_unit})"
        ws.range((T5_START - 1, 6)).value = f"Force                                  ({output_unit})"
        ws.range((T5_START - 1, 8)).value = f"Force                                  ({output_unit})"
        ws.range((T5_START - 1, 10)).value = f"Mean Force ({output_unit})"
        
        # Table 6 & 7 column headers (Row T6_7_START - 2)
        ws.range((T6_7_START - 2, 2)).value = f"Force ({output_unit})"
        ws.range((T6_7_START - 2, 9)).value = f"Force ({output_unit})"
        
        # Table 7 sub-headers (Reference Force Estimation - Linear)
        ws.range((T6_7_START - 1, 3)).value = "1st (0˚)"
        ws.range((T6_7_START - 1, 4)).value = "2nd (120˚)"
        ws.range((T6_7_START - 1, 6)).value = "3rd (240˚)"
        ws.range((T6_7_START - 1, 7)).value = "Mean Value"

        # Table 8 sub-headers
        ws.range((T6_7_START - 1, 10)).value = f"Force 1 ({output_unit})"
        ws.range((T6_7_START - 1, 11)).value = f"Force 2 ({output_unit})"
        ws.range((T6_7_START - 1, 12)).value = f"Force 3 ({output_unit})"
        ws.range((T6_7_START - 1, 13)).value = f"Mean Value ({output_unit})"
        
        # Ensure text fits
        ws.range((T6_7_START - 1, 10), (T6_7_START - 1, 13)).api.WrapText = True
        ws.range(f"{T6_7_START - 1}:{T6_7_START - 1}").rows.autofit()
        
        # Table 9 (Uncertainty) specific header restore
        ws.range((T8_START - 1, 13)).value = "Class"
        
        # Autofit all header rows to ensure content is not clipped
        ws.range("23:24").rows.autofit()
        
        # Dynamic Conversion Unit Statement
        ws.range((17, 10)).value = "Conversion Unit:"
        ws.range((18, 10)).value = f"1 {output_unit} = "
        ws.range((18, 11)).value = unit_scale
        ws.range((18, 12)).value = "kN"
        
        # Ensure we don't mess up the rest of the template, we'll only change what's safe.

        # --- REPLICATE AUTHORITATIVE FOOTER LAYOUT ---
        # The user wants the layout starting from "Calibrated by:" to "date:" matched exactly.
        # Original template rows for footer are T4_START + 9 to + 13.
        # We must ensure they FIT on Page 1.
        
        # 1. Position labels exactly as in template (relative to T4)
        write_cell((T4_START+9, 2), "Calibrated by:", align='left')
        write_cell((T4_START+9, 9), "Checked by:", align='left')
        write_cell((T4_START+12, 2), "RFM", align='center')
        write_cell((T4_START+12, 6), "ACCG", align='center')
        write_cell((T4_START+13, 9), "date:", align='right')
        
        # 2. Clear Date fields
        ws.range((T4_START+13, 10)).value = None
        page2_date_row = 105 + 4*extra_rows
        ws.range((page2_date_row, 10)).value = None
        
        # 3. Position Correction Box (Group 7)
        for shape in ws.api.Shapes:
            if "Group 7" in shape.Name:
                # Place it precisely over J/K area near the signature
                shape.Top = ws.range((T4_START+9, 11)).top

        # --- AUTHORITATIVE PAGE BREAK ---
        ws.api.ResetAllPageBreaks()
        ws.range(f"{T5_START - 3}:{T5_START - 3}").api.PageBreak = -4135 # Page 2 starts here

        # 3. Reference Standard & Env
        write_cell((T4_START+3, 3), data.get("ref_model"), align='left')
        write_cell((T4_START+5, 3), data.get("ref_sn"), align='left')
        write_cell((T4_START+6, 3), data.get("ref_cert"), align='left')
        write_cell((T4_START+7, 3), data.get("ref_date"), align='left')
        write_cell((T4_START+3, 7), data.get("coeff_a"), FMT_SCI)
        write_cell((T4_START+4, 7), data.get("coeff_b"), FMT_SCI)
        write_cell((T4_START+5, 7), data.get("coeff_c"), FMT_SCI)
        write_cell((T4_START+6, 7), data.get("ref_unc"), FMT_ERROR)
        write_cell((T4_START+7, 7), 2.0, FMT_ERROR)
        env_row = 43 + extra_rows
        write_cell((env_row, 11), data.get("temp_before"), FMT_ENV)
        write_cell((env_row, 12), data.get("temp_after"), FMT_ENV)
        write_cell((env_row+1, 11), data.get("hum_before"), FMT_ENV)
        write_cell((env_row+1, 12), data.get("hum_after"), FMT_ENV)

        # 4. Table 2: Pre-Loading
        preloading = data.get("preloading", [])
        for i, pt in enumerate(preloading[:3]):
            row = T2_START + i
            write_cell((row, 2), pt.get("m1"), FMT_FORCE_2)
            write_cell((row, 3), pt.get("s1"), FMT_MVV)
            write_cell((row, 4), pt.get("m2"), FMT_FORCE_2)
            write_cell((row, 6), pt.get("s2"), FMT_MVV)
            write_cell((row, 7), pt.get("m3"), FMT_FORCE_2)
            write_cell((row, 8), pt.get("s3"), FMT_MVV)

        # 5. Populate All Results
        for i, res in enumerate(results):
            pt_name = f"{i}{'st' if i==1 else 'nd' if i==2 else 'rd' if i==3 else 'th'}" if i > 0 else "0.0"
            r3 = T3_START + i
            write_cell((r3, 2), pt_name)
            write_cell((r3, 3), res.get("targetForceKgf"), FMT_FORCE_2)
            write_cell((r3, 4), res.get("series1_m"), FMT_FORCE_2)
            write_cell((r3, 6), res.get("series1_mvv"), FMT_MVV)
            write_cell((r3, 7), res.get("series2_m"), FMT_FORCE_2)
            write_cell((r3, 8), res.get("series2_mvv"), FMT_MVV)
            write_cell((r3, 9), res.get("series3_m"), FMT_FORCE_2)
            write_cell((r3, 10), res.get("series3_mvv"), FMT_MVV)
            write_cell((r3, 11), res.get("meanForce"), FMT_FORCE_2)
            write_cell((r3, 12), res.get("meanRawDeflection"), FMT_MVV)
            r5 = T5_START + i
            write_cell((r5, 2), pt_name)
            write_cell((r5, 3), (res.get("series1_m") or 0) * unit_scale, FMT_FORCE_5)
            nets = res.get("netValues", [None, None, None])
            write_cell((r5, 4), nets[0], FMT_MVV)
            write_cell((r5, 6), (res.get("series2_m") or 0) * unit_scale, FMT_FORCE_5)
            write_cell((r5, 7), nets[1], FMT_MVV)
            write_cell((r5, 8), (res.get("series3_m") or 0) * unit_scale, FMT_FORCE_5)
            write_cell((r5, 9), nets[2], FMT_MVV)
            write_cell((r5, 10), res.get("meanForceKn"), FMT_FORCE_5)
            write_cell((r5, 11), res.get("meanNetDeflection"), FMT_MVV)
            r67 = T6_7_START + i
            write_cell((r67, 2), res.get("targetForceKn"), FMT_FORCE_4)
            interps = res.get("interpolatedValues", [None, None, None])
            write_cell((r67, 3), interps[0], FMT_MVV)
            write_cell((r67, 4), interps[1], FMT_MVV)
            write_cell((r67, 6), interps[2], FMT_MVV)
            write_cell((r67, 7), res.get("meanNetDeflection"), FMT_MVV)
            write_cell((r67, 9), res.get("targetForceKn"), FMT_FORCE_4)
            poly_f = res.get("runForcesKn", [None, None, None])
            write_cell((r67, 10), poly_f[0], FMT_FORCE_5)
            write_cell((r67, 11), poly_f[1], FMT_FORCE_5)
            write_cell((r67, 12), poly_f[2], FMT_FORCE_5)
            write_cell((r67, 13), res.get("meanForceKn"), FMT_FORCE_5)
            r8 = T8_START + i
            write_cell((r8, 3), pt_name)
            write_cell((r8, 4), res.get("w_rep_percent"), FMT_UNC_COMP)
            write_cell((r8, 6), res.get("w_res_percent"), FMT_UNC_COMP)
            write_cell((r8, 7), res.get("w_std_percent"), FMT_UNC_COMP)
            write_cell((r8, 8), res.get("w_comb_percent"), FMT_UNC_COMP)
            write_cell((r8, 9), res.get("relative_uncertainty_percent"), FMT_UNC_EXP)
            write_cell((r8, 10), res.get("accuracy_error_percent"), FMT_ERROR)
            write_cell((r8, 11), res.get("repeatability_error_percent"), FMT_ERROR)
            write_cell((r8, 12), res.get("zero_error_percent"), FMT_ERROR)
            
            # Formatter for Outside Class
            classification = res.get("classification")
            display_class = "" if classification == "Outside Class" else classification
            write_cell((r8, 13), display_class)

        # 6. Pagination Preservation
        last_footer_row = FOOTER_START + 10 
        ws.api.PageSetup.PrintArea = f"$B$1:$M${last_footer_row}"
        ws.api.PageSetup.Zoom = False
        ws.api.PageSetup.FitToPagesWide = 1
        ws.api.PageSetup.FitToPagesTall = False 
        
        # --- FINAL LAYOUT ALIGNMENTS ---
        # Align "Date:" field with "Checked by:" horizontally
        # Original positions: "Checked by:" is at Col 9, Row T4_START+9. 
        # "date:" is at Col 9, Row T4_START+13.
        # We explicitly enforce left-alignment so they visually match.
        write_cell((T4_START+9, 9), "Checked by:", align='left')
        write_cell((T4_START+13, 9), "date:", align='left')
        
        # Ensure the date value entry fields (Col 10) are strictly blank to prevent #######
        ws.range((T4_START+13, 10)).value = None
        ws.range((T4_START+13, 10)).number_format = "@"
        
        page2_date_row = 105 + 4*extra_rows
        ws.range((page2_date_row, 10)).value = None
        ws.range((page2_date_row, 10)).number_format = "@"
        
        # --- FIX RANGE CLIPPING ---
        # Give the "Range:" cell specifically more vertical room to prevent 
        # characters like "0" from being vertically clipped during PDF render.
        ws.range("7:7").row_height = 18.0
        
        wb.save(output_path)
        print(f"Generated: {output_path}")

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error: {str(e)}")
        sys.exit(1)
    finally:
        wb.close()
        app.quit()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python excel_bridge.py '<json_data>'")
        sys.exit(1)
    try:
        if os.path.exists(sys.argv[1]):
            with open(sys.argv[1], 'r') as f: input_data = json.load(f)
        else:
            input_data = json.loads(sys.argv[1])
        template = "NewFormat.xlsx"
        output = f"reports/Report_{input_data.get('id', 'temp')}.xlsx"
        if not os.path.exists("reports"): os.makedirs("reports")
        populate_new_format(template, output, input_data)
    except Exception as e:
        print(f"Error: {str(e)}")
        sys.exit(1)
