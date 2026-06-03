const net = require('net');

class DMP41Interface {
  constructor(host = '192.168.1.100', port = 1234) {
    this.host = host;
    this.port = port;
    this.socket = null;
    this.connectionState = 'disconnected'; // 'disconnected', 'standby', 'connected'
    this.demoMode = process.env.DMP41_DEMO_MODE === 'true';
    this.currentChannel = 1;
    this.readingBuffer = [];
    this.bufferSize = 10;
    
    // Command queuing to prevent race conditions on the TCP socket
    this.commandQueue = [];
    this.isProcessingQueue = false;
    this.dataBuffer = '';
  }

  get isConnected() {
    return this.connectionState === 'connected';
  }

  /**
   * Checks if the current readings are stable.
   * Stability is defined as the standard deviation being below a threshold.
   */
  isStable(threshold = 0.000010) {
    if (this.readingBuffer.length < this.bufferSize) return false;
    
    const mean = this.readingBuffer.reduce((a, b) => a + b) / this.readingBuffer.length;
    const variance = this.readingBuffer.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / this.readingBuffer.length;
    const stdDev = Math.sqrt(variance);
    
    return stdDev < threshold;
  }

  async disconnect() {
    return new Promise((resolve) => {
      if (this.socket) {
        this.socket.once('close', () => {
          this.connectionState = 'disconnected';
          resolve();
        });
        this.socket.destroy();
        this.socket = null;
      } else {
        this.connectionState = 'disconnected';
        resolve();
      }
    });
  }

  async connect() {
    await this.disconnect(); // Ensure any previous connection is fully released

    return new Promise((resolve, reject) => {
      if (this.demoMode) {
        this.connectionState = 'connected';
        console.log('DMP41 switched to Demo Mode (Connected)');
        return resolve();
      }

      console.log(`Attempting real connection to DMP41 at ${this.host}:${this.port}...`);
      this.socket = net.createConnection({ 
        host: this.host, 
        port: this.port
      });

      // Connection timeout logic
      const connectTimeout = setTimeout(() => {
        if (this.connectionState !== 'connected') {
          console.log(`Connection timeout to real DMP41 at ${this.host}:${this.port}`);
          this.connectionState = 'standby';
          if (this.socket) this.socket.destroy();
          reject(new Error('Connection timeout'));
        }
      }, 5000);

      this.socket.on('connect', async () => {
        clearTimeout(connectTimeout);
        this.connectionState = 'connected';
        console.log(`Successfully connected to real DMP41 at ${this.host}:${this.port}`);
        
        // Enable TCP Keep-Alive to keep the connection open over long periods of inactivity
        this.socket.setKeepAlive(true, 10000);

        try {
          // Enforce output format (COF0) and acknowledgement behavior (SRB1) for robustness
          await this.sendCommand('COF0');
          await this.sendCommand('SRB1');
          
          // Ensure channel is selected on connect
          await this.selectChannel(this.currentChannel);
          resolve();
        } catch (e) {
          console.error('Initial configuration failed, device not responding:', e);
          this.connectionState = 'standby';
          if (this.socket) { this.socket.destroy(); this.socket = null; }
          reject(new Error('Connected to port, but DMP41 did not respond. Check connection.'));
        }
      });

      this.socket.on('error', (err) => {
        clearTimeout(connectTimeout);
        console.log(`Failed to connect to real DMP41 at ${this.host}:${this.port} - ${err.message}`);
        this.connectionState = 'standby';
        reject(err);
      });

      this.socket.on('end', () => {
        console.log('DMP41 closed the TCP connection');
        this.connectionState = 'disconnected';
      });
      
      const processReceivedData = (data) => {
        this.dataBuffer += data.toString('ascii');
        let match;
        while ((match = this.dataBuffer.match(/\r\n|\n|\r/))) {
          const newlineIndex = match.index;
          const matchLength = match[0].length;
          const response = this.dataBuffer.substring(0, newlineIndex).trim();
          this.dataBuffer = this.dataBuffer.substring(newlineIndex + matchLength);
          
          if (response === '') continue; // Ignore empty lines from trailing CRs
          
          if (this.currentPendingCommand) {
            this.currentPendingCommand.resolve(response);
            this.currentPendingCommand = null;
            this.processQueue();
          } else {
             console.warn('Received unexpected data from DMP41:', response);
          }
        }
      };

      this.socket.on('data', processReceivedData);
    });
  }

  async setDemoMode(isDemo) {
    this.demoMode = isDemo;
    if (this.demoMode) {
      this.connectionState = 'connected'; 
    } else {
      await this.disconnect();
    }
    return this.demoMode;
  }

  /**
   * Internal queue processor to ensure commands are sent one-by-one
   */
  async sendCommand(command) {
    if (this.demoMode) {
      return this.generateDemoResponse(command);
    }

    if (!this.isConnected) {
      throw new Error('Not connected to DMP41');
    }

    return new Promise((resolve, reject) => {
      this.commandQueue.push({ command, resolve, reject });
      if (!this.isProcessingQueue) {
        this.processQueue();
      }
    });
  }

  processQueue() {
    if (this.commandQueue.length === 0) {
      this.isProcessingQueue = false;
      return;
    }

    this.isProcessingQueue = true;
    const pending = this.commandQueue.shift();
    this.currentPendingCommand = pending;

    const fullCmd = `${pending.command}\r\n`;
    
    // Set a safety timeout for this specific command
    const timeout = setTimeout(() => {
      if (this.currentPendingCommand === pending) {
        pending.reject(new Error(`Command timeout: no response received from hardware for '${pending.command}'`));
        this.currentPendingCommand = null;
        this.dataBuffer = ''; // Clear buffer to prevent shifting out-of-sync responses to the next command
        this.processQueue();
      }
    }, 3000);

    // Update resolve to clear timeout
    const originalResolve = pending.resolve;
    pending.resolve = (val) => {
      clearTimeout(timeout);
      originalResolve(val);
    };

    try {
      if (this.socket) {
         this.socket.write(fullCmd);
      } else {
         throw new Error("No active connection to write to.");
      }
    } catch (err) {
      pending.reject(err);
      this.currentPendingCommand = null;
      this.processQueue();
    }
  }

  async requestAdminRights(password = '1234') {
    // Required before TAR, ASA, etc.
    const response = await this.sendCommand(`RAR${password}`);
    return response === '0'; 
  }

  async selectChannel(channel = 1) {
    this.currentChannel = channel;
    if (this.demoMode) return true;
    const response = await this.sendCommand(`CHS${channel}`);
    return response === '0';
  }

  async readMeasurementValue(type = 24) {
    // type 24 = Net mV/V
    // type 0 = Gross value (display value)
    // Documentation Page 56: COF 0 returns "Measured value, channel, status" (3 fields)
    // BUT the HBM ASCII format often returns "Value,Unit,Status,..." depending on COF settings.
    // Assuming standard COF0: Value, Unit, Status...
    const response = await this.sendCommand(`MSV?${type}`);
    const parts = response.split(',');
    const val = parseFloat(parts[0]) || 0;

    // Attempt to extract unit from the comma-separated parts if it exists, otherwise default to what is requested
    let extractedUnit = type == 24 ? 'mV/V' : '';
    if (parts.length > 1 && isNaN(parseFloat(parts[1]))) {
        // If the second part is not a number (e.g. 'mV/V', 'kg', 'N'), it's likely the unit string
        extractedUnit = parts[1].trim();
    }

    // Only update the stability buffer if we are reading the primary Net mV/V (type 24)
    if (type == 24) {
        this.readingBuffer.push(val);
        if (this.readingBuffer.length > this.bufferSize) {
          this.readingBuffer.shift();
        }
    }

    return {
      raw_deflection: val,
      channel: parts.length > 2 ? parts[1] : '1', // Fallback if no unit present
      status_code: parts.length > 2 ? parts[2] : '0',
      unit: extractedUnit
    };
  }

  async tare() {
    // Documentation Page 49: 'TAR' with no parameters is 'Start taring'
    // Requires Admin Rights
    await this.requestAdminRights();
    const response = await this.sendCommand('TAR');
    return response === '0';
  }

  async removeTare() {
    // To remove tare, we set the gross value equal to the net value by clearing the tare memory
    // Documentation: 'RDT' is usually Reset/Remove Tare, but on DMP41 the command is 'TDT' (Tare Delete)
    await this.requestAdminRights();
    const response = await this.sendCommand('TDT');
    return response === '0';
  }
  /**
   * Simulates a DMP41 response for Demo Mode.
   * Provides high-precision, stable readings with minimal noise.
   */
  generateDemoResponse(command) {
    if (command.startsWith('MSV?')) {
      // Simulate a stable reading around 0.078086 mV/V with very low noise (ISO 376 class)
      // Noise is ±0.000005 mV/V to simulate a 'perfect' environment
      const noise = (Math.random() - 0.5) * 0.000010;
      const baseValue = 0.078086 + noise;
      return `${baseValue.toFixed(6)},mV/V,G,0`;
    }
    if (command === 'TAR') {
      this.readingBuffer = []; // Clear buffer on tare simulation
      return '0';
    }
    if (command === 'RAR?') {
      return '1'; // Simulate having admin rights
    }
    if (command === 'RAR') {
      return '0'; // Simulate accepting admin password
    }
    if (command.endsWith('?')) {
      return '1'; // Generic simulated response for other queries
    }
    return '0'; // Success for other setting commands
  }
}

module.exports = DMP41Interface;