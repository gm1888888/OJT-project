class CertificateGenerator {
  constructor() {
    this.companyName = 'Calibration Laboratory';
    this.companyAddress = 'Valenzuela City';
  }

  async generateHTMLCertificate(projectData, resultsData) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Calibration Certificate</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; border-bottom: 2px solid black; padding-bottom: 10px; }
          .certificate-no { font-size: 14px; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background-color: #f0f0f0; }
          .results-table tr:nth-child(odd) { background-color: #f9f9f9; }
          .footer { margin-top: 40px; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>CALIBRATION CERTIFICATE</h1>
          <p class="certificate-no">No. ${projectData.cert_no}</p>
          <p>${this.companyName}</p>
        </div>

        <section>
          <h2>Calibration Item</h2>
          <table>
            <tr>
              <td><strong>Item:</strong></td>
              <td>${projectData.instrument_name}</td>
            </tr>
            <tr>
              <td><strong>Manufacturer/Model:</strong></td>
              <td>${projectData.make_model}</td>
            </tr>
            <tr>
              <td><strong>Serial No.:</strong></td>
              <td>${projectData.serial_number}</td>
            </tr>
            <tr>
              <td><strong>Capacity:</strong></td>
              <td>${projectData.capacity_kgf} kgf (${projectData.capacity_kn} kN)</td>
            </tr>
            <tr>
              <td><strong>Range:</strong></td>
              <td>${projectData.range_min_kgf} to ${projectData.range_max_kgf} kgf</td>
            </tr>
            <tr>
              <td><strong>Client:</strong></td>
              <td>${projectData.client_name}</td>
            </tr>
          </table>
        </section>

        <section>
          <h2>Measurement Results</h2>
          <table class="results-table">
            <thead>
              <tr>
                <th>Point</th>
                <th>Indicated (kgf)</th>
                <th>Applied (kN)</th>
                <th>Uncertainty (kN)</th>
                <th>Rel. Uncertainty (%)</th>
                <th>Relative Error (%)</th>
                <th>Classification</th>
              </tr>
            </thead>
            <tbody>
              ${resultsData.map(result => `
                <tr>
                  <td>${result.point}</td>
                  <td>${result.target_kgf}</td>
                  <td>${result.mean_kn.toFixed(6)}</td>
                  <td>${result.uncertainty_kn.toFixed(9)}</td>
                  <td>${result.relative_uncertainty_percent.toFixed(3)}</td>
                  <td>${result.relative_error_percent.toFixed(3)}</td>
                  <td>${result.classification}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Uncertainty Statement</h2>
          <p>The uncertainty stated is the expanded uncertainty obtained by multiplying the combined 
             standard uncertainty by the coverage factor k = 2. It represents approximately 95% confidence level.</p>
          <p><strong>Standard Used:</strong> ${projectData.reference_load_cell || 'N/A'}</p>
          <p><strong>Calibration Date:</strong> ${projectData.calibration_date}</p>
          <p><strong>Temperature:</strong> ${projectData.temperature_before || '--'}°C to ${projectData.temperature_after || '--'}°C</p>
          <p><strong>Humidity:</strong> ${projectData.humidity_before || '--'}% to ${projectData.humidity_after || '--'}%</p>
        </section>

        <div class="footer">
          <p>This certificate is valid for the instrument as tested on the date shown above.</p>
          <p>Generated: ${new Date().toLocaleString()}</p>
        </div>
      </body>
      </html>
    `;
    return html;
  }

  async generateCSVCertificate(projectData, resultsData) {
    let csv = 'Calibration Certificate\n';
    csv += `Certificate No,${projectData.cert_no}\n`;
    csv += `Instrument,${projectData.instrument_name}\n`;
    csv += `Serial Number,${projectData.serial_number}\n`;
    csv += `Calibration Date,${projectData.calibration_date}\n\n`;
    csv += 'Point,Target (kgf),Applied (kN),Uncertainty (kN),Rel. Uncertainty (%),Classification\n';
    
    resultsData.forEach(result => {
      csv += `${result.point},${result.target_kgf},${result.mean_kn.toFixed(6)},${result.uncertainty_kn.toFixed(9)},${result.relative_uncertainty_percent.toFixed(3)},${result.classification}\n`;
    });

    return csv;
  }
}

module.exports = CertificateGenerator;