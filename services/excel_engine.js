const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

class ExcelEngine {
  constructor() {
    this.bridgePath = path.join(__dirname, '..', 'excel_bridge.py');
    this.reportsDir = path.join(__dirname, '..', 'reports');
    this._pythonCmd = null;
  }

  /**
   * Detects the best python command to use (py or python)
   */
  async getPythonCommand() {
    if (this._pythonCmd) return this._pythonCmd;
    
    if (process.env.PYTHON_CMD) {
      this._pythonCmd = process.env.PYTHON_CMD;
      return this._pythonCmd;
    }

    // On Windows, 'py' is generally more reliable as it points to the latest installed Python
    if (process.platform === 'win32') {
      try {
        await new Promise((resolve, reject) => {
          exec('py --version', (err) => err ? reject(err) : resolve());
        });
        this._pythonCmd = 'py';
        return this._pythonCmd;
      } catch (e) {
        // Fallback to python
      }
    }

    this._pythonCmd = 'python';
    return this._pythonCmd;
  }

  /**
   * Generates a populated Excel report from project data
   * @param {Object} projectData 
   * @returns {Promise<string>} Path to the generated file
   */
  async generateReport(projectData) {
    const pythonCmd = await this.getPythonCommand();
    return new Promise((resolve, reject) => {
      // Use a temporary file to pass the JSON data to avoid Windows CLI length limits and escaping issues.
      const tempJsonPath = path.join(this.reportsDir, `temp_data_${Date.now()}.json`);
      if (!fs.existsSync(this.reportsDir)) {
          fs.mkdirSync(this.reportsDir);
      }
      fs.writeFileSync(tempJsonPath, JSON.stringify(projectData), 'utf8');

      const command = `${pythonCmd} "${this.bridgePath}" "${tempJsonPath}"`;

      exec(command, (error, stdout, stderr) => {
        // Clean up the temp file
        if (fs.existsSync(tempJsonPath)) {
            fs.unlinkSync(tempJsonPath);
        }

        if (error) {
          console.error(`Excel Bridge Error: ${error.message}\nSTDOUT: ${stdout}`);
          return reject(new Error(`${error.message}\nSTDOUT: ${stdout}`));
        }
        if (stderr) {
          console.warn(`Excel Bridge Warning: ${stderr}`);
        }
        
        const outputLine = stdout.trim().split('\n').pop();
        if (outputLine.startsWith('Generated:')) {
          const filePath = outputLine.split(': ').pop();
          resolve(filePath);
        } else {
          reject(new Error(`Unexpected output from bridge: ${stdout}`));
        }
      });
    });
  }
  async generatePDF(excelPath) {
    const pythonCmd = await this.getPythonCommand();
    return new Promise((resolve, reject) => {
      const pdfPath = excelPath.replace('.xlsx', '.pdf').replace('.xls', '.pdf');
      const scriptPath = path.join(__dirname, '..', 'excel_to_pdf.py');
      exec(`${pythonCmd} "${scriptPath}" "${excelPath}" "${pdfPath}"`, { cwd: path.join(__dirname, '..') }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`PDF Generation failed: ${stderr || error.message}\nSTDOUT: ${stdout}`));
          return;
        }
        const outputLine = stdout.trim().split('\n').pop();
        if (outputLine.startsWith('PDF generated:')) {
          resolve(pdfPath);
        } else {
          reject(new Error(`Unexpected output from PDF generator: ${stdout}`));
        }
      });
    });
  }
}

module.exports = new ExcelEngine();
