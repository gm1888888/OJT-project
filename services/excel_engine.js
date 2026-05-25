const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

class ExcelEngine {
  constructor() {
    this.bridgePath = path.join(__dirname, '..', 'excel_bridge.py');
    this.reportsDir = path.join(__dirname, '..', 'reports');
  }

  /**
   * Generates a populated Excel report from project data
   * @param {Object} projectData 
   * @returns {Promise<string>} Path to the generated file
   */
  async generateReport(projectData) {
    return new Promise((resolve, reject) => {
      const jsonData = JSON.stringify(projectData).replace(/"/g, '\\"');
      const command = `python "${this.bridgePath}" "${jsonData}"`;

      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Excel Bridge Error: ${error.message}`);
          return reject(error);
        }
        if (stderr) {
          console.warn(`Excel Bridge Warning: ${stderr}`);
        }
        
        const outputLine = stdout.trim().split('\n').pop();
        if (outputLine.startsWith('Excel report generated:')) {
          const filePath = outputLine.split(': ').pop();
          resolve(filePath);
        } else {
          reject(new Error(`Unexpected output from bridge: ${stdout}`));
        }
      });
    });
  }
}

module.exports = new ExcelEngine();
