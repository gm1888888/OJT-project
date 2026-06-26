const net = require('net');
const fs = require('fs');
const path = require('path');

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
    
    this.isConnecting = false;
    this.activeTimers = new Set();

    // Command queuing to prevent race conditions on the TCP socket
    this.commandQueue = [];
    this.isProcessingQueue = false;
    this.dataBuffer = '';
    this.currentPendingCommand = null;
    this.heartbeatInterval = null;
    
    // Logging setup
    this.logDir = path.join(__dirname, '..', 'logs');
    this.logFile = path.join(this.logDir, 'hw_communication.log');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  _setTimer(callback, ms) {
    const timer = setTimeout(() => {
      this.activeTimers.delete(timer);
      callback();
    }, ms);
    this.activeTimers.add(timer);
    return timer;
  }

  _clearAllTimers() {
    for (const timer of this.activeTimers) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._log('Starting connection heartbeat (30s)', 'STATUS');
    this.heartbeatInterval = setInterval(async () => {
      if (this.isConnected && !this.isProcessingQueue && !this.demoMode) {
        try {
          await this.sendCommand('RAR?');
        } catch (err) {
          this._log(`Heartbeat failed: ${err.message}`, 'WARN');
        }
      }
    }, 30000);
  }

  _stopHeartbeat() {
    if (this.heartbeatInterval) {
      this._log('Stopping connection heartbeat', 'STATUS');
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  _log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const formattedMsg = `[${timestamp}] [DMP41] [LAN] [${level}] ${message}`;
    console.log(formattedMsg);
    
    try {
      fs.appendFileSync(this.logFile, formattedMsg + '\n');
    } catch (err) {
      console.error(`Failed to write to hardware log: ${err.message}`);
    }
  }

  get isConnected() {
    return this.connectionState === 'connected';
  }

  isStable(threshold = 0.000010) {
    if (this.readingBuffer.length < this.bufferSize) return false;
    const mean = this.readingBuffer.reduce((a, b) => a + b) / this.readingBuffer.length;
    const variance = this.readingBuffer.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / this.readingBuffer.length;
    const stdDev = Math.sqrt(variance);
    return stdDev < threshold;
  }

  async disconnect() {
    this._log('Disconnect requested', 'ACTION');
    this._stopHeartbeat();
    this._clearAllTimers();
    
    return new Promise((resolve) => {
      if (this.socket) {
        this._log(`Closing LAN socket to ${this.host}:${this.port}`, 'ACTION');
        this.socket.removeAllListeners();
        this.socket.once('close', () => { 
          this._log('LAN socket closed', 'STATUS');
          this.socket = null;
          this.connectionState = 'disconnected';
          this.isConnecting = false;
          resolve(); 
        });
        this.socket.destroy();
      } else {
        this.connectionState = 'disconnected';
        this.isConnecting = false;
        resolve();
      }
    });
  }

  async connect() {
    if (this.isConnecting) {
      this._log('Connection attempt already in progress. Ignoring duplicate request.', 'WARN');
      return;
    }

    this._log('Connecting via LAN...', 'ACTION');
    this.isConnecting = true;
    
    try {
      await this.disconnect();
    } catch (e) {
      this._log(`Error during cleanup before connect: ${e.message}`, 'ERROR');
    }

    return new Promise((resolve, reject) => {
      if (this.demoMode) {
        this.connectionState = 'connected';
        this.isConnecting = false;
        this._log('DMP41 switched to Demo Mode (Connected)', 'STATUS');
        return resolve();
      }

      this._log(`Opening TCP socket to ${this.host}:${this.port}`, 'CONFIG');
      this.socket = net.createConnection({ host: this.host, port: this.port });

      const connectTimeout = this._setTimer(() => {
        if (this.connectionState !== 'connected') {
          const err = new Error(`Connection timeout to DMP41 at ${this.host}:${this.port}`);
          this._log(err.message, 'TIMEOUT');
          this.connectionState = 'standby';
          this.isConnecting = false;
          if (this.socket) this.socket.destroy();
          reject(err);
        }
      }, 5000);

      this.socket.on('connect', async () => {
        this._log(`Successfully connected to DMP41 via LAN at ${this.host}:${this.port}`, 'STATUS');
        this.socket.setKeepAlive(true, 10000);
        
        try {
          this.connectionState = 'connected';
          this._log('Performing initial handshake (COF0, SRB1, CHS)...', 'ACTION');
          await this.sendCommand('COF0');
          await this.sendCommand('SRB1');
          await this.selectChannel(this.currentChannel);
          
          this.activeTimers.delete(connectTimeout);
          clearTimeout(connectTimeout);
          this.isConnecting = false;
          this._startHeartbeat();
          resolve();
        } catch (e) {
          this._log(`Initial configuration failed: ${e.message}`, 'ERROR');
          this.connectionState = 'standby';
          this.isConnecting = false;
          if (this.socket) { this.socket.destroy(); this.socket = null; }
          this.activeTimers.delete(connectTimeout);
          clearTimeout(connectTimeout);
          reject(new Error(`Handshake failed: ${e.message}`));
        }
      });

      this.socket.on('error', (err) => {
        this._log(`TCP Socket Error: ${err.message}`, 'ERROR');
        this.connectionState = 'standby';
        this.isConnecting = false;
        reject(err);
      });

      this.socket.on('end', () => {
        this._log('DMP41 closed the TCP connection', 'STATUS');
        this.connectionState = 'disconnected';
        this.isConnecting = false;
      });
      
      this.socket.on('data', (data) => this._processReceivedData(data));
    });
  }

  _processReceivedData(data) {
    const rawData = data.toString('ascii');
    this._log(`RAW IN: ${JSON.stringify(rawData)}`, 'DATA');
    this.dataBuffer += rawData;
    
    if (this.dataBuffer.length > 5000) {
      this.dataBuffer = '';
    }

    let match;
    while ((match = this.dataBuffer.match(/\r\n|\n|\r/))) {
      const newlineIndex = match.index;
      const matchLength = match[0].length;
      const response = this.dataBuffer.substring(0, newlineIndex).trim();
      this.dataBuffer = this.dataBuffer.substring(newlineIndex + matchLength);
      
      if (response === '' && matchLength === 1 && match[0] === '\r') {
          if (this.dataBuffer.startsWith('\n')) {
              this.dataBuffer = this.dataBuffer.substring(1);
          }
      }

      if (response === '') continue; 
      
      if (this.currentPendingCommand) {
        this._log(`CMD RES: [${this.currentPendingCommand.command}] -> ${response}`, 'DATA');
        this.currentPendingCommand.resolve(response);
        this.currentPendingCommand = null;
        this.processQueue();
      }
    }
  }

  async setDemoMode(isDemo) {
    this.demoMode = isDemo;
    if (this.demoMode) this.connectionState = 'connected';
    else await this.disconnect();
    return this.demoMode;
  }

  async sendCommand(command) {
    if (this.demoMode) return this.generateDemoResponse(command);
    if (!this.isConnected) throw new Error('Not connected to DMP41');

    return new Promise((resolve, reject) => {
      this.commandQueue.push({ command, resolve, reject });
      if (!this.isProcessingQueue) this.processQueue();
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
    
    const timeout = setTimeout(() => {
      if (this.currentPendingCommand === pending) {
        pending.reject(new Error(`Command timeout: ${pending.command}`));
        this._log(`Command timeout: ${pending.command}. Clearing stale dataBuffer.`, 'WARN');
        this.dataBuffer = ''; // Clear stale buffer to prevent corruption
        this.currentPendingCommand = null;
        this.processQueue();
      }
    }, 4000);

    const originalResolve = pending.resolve;
    pending.resolve = (val) => {
      clearTimeout(timeout);
      originalResolve(val);
    };

    try {
      if (this.socket) this.socket.write(fullCmd);
      else throw new Error("No active socket");
    } catch (err) {
      pending.reject(err);
      this.currentPendingCommand = null;
      this.processQueue();
    }
  }

  async requestAdminRights(password = '1234') {
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
    const response = await this.sendCommand(`MSV?${type}`);
    const parts = response.split(',');
    const val = parseFloat(parts[0]) || 0;
    let extractedUnit = '';
    
    // Improved unit extraction
    if (parts.length > 1) {
      const unitPart = parts[1].trim();
      if (isNaN(parseFloat(unitPart))) {
        extractedUnit = unitPart;
      }
    }

    if (type == 24) {
        this.readingBuffer.push(val);
        if (this.readingBuffer.length > this.bufferSize) this.readingBuffer.shift();
    }

    const statusCode = parts.length > 2 ? parts[2].trim() : '0';
    
    const result = {
      raw_deflection: val,
      channel: this.currentChannel,
      status_code: statusCode,
      unit: extractedUnit,
      raw_response: response,
      requested_type: type,
      timestamp: new Date().toISOString()
    };

    this._log(`READ: [Type ${type}] Val=${val.toFixed(7)} Unit=${extractedUnit} Raw="${response}"`, 'DATA');
    return result;
  }

  async tare() {
    await this.requestAdminRights();
    const response = await this.sendCommand('TAR');
    return response === '0';
  }

  async removeTare() {
    await this.requestAdminRights();
    const response = await this.sendCommand('TDT');
    return response === '0';
  }
  
  generateDemoResponse(command) {
    if (command.startsWith('MSV?')) {
      const noise = (Math.random() - 0.5) * 0.000002;
      const baseValue = 0.0780862 + noise;
      const type = command.replace('MSV?', '') || '0';
      const unit = type === '24' ? 'mV/V' : 'kgf';
      return `${baseValue.toFixed(7)},${unit},G,0`;
    }
    if (command === 'TAR') return '0';
    if (command === 'RAR?') return '1';
    if (command === 'RAR') return '0';
    if (command.endsWith('?')) return '1';
    return '0';
  }
}

module.exports = DMP41Interface;