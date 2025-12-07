const cron = require('node-cron');
const axios = require('axios');

class ServerPinger {
  constructor() {
    this.serverUrl = process.env.SERVER_URL || process.env.BACKEND_URL;
    this.pingInterval = process.env.PING_INTERVAL || '*/10 * * * *'; // Every 10 minutes by default
    this.isEnabled = process.env.ENABLE_PINGER === 'true' || process.env.NODE_ENV === 'production';
    this.healthEndpoint = '/api/health';
    this.pingCount = 0;
    this.failedPings = 0;
  }

  init() {
    if (!this.isEnabled) {
      console.log('Server pinger is disabled');
      return;
    }

    if (!this.serverUrl) {
      console.warn('SERVER_URL not set - server pinger cannot start');
      return;
    }

    // Schedule the pinger
    cron.schedule(this.pingInterval, async () => {
      await this.ping();
    });

    console.log(`Server pinger initialized: ${this.serverUrl}${this.healthEndpoint}`);
    console.log(`Ping interval: ${this.pingInterval}`);
  }

  async ping() {
    try {
      this.pingCount++;
      const startTime = Date.now();
      
      const response = await axios.get(`${this.serverUrl}${this.healthEndpoint}`, {
        timeout: 30000, // 30 second timeout
        headers: {
          'User-Agent': 'ServerPinger/1.0',
          'X-Ping-Source': 'internal'
        }
      });

      const responseTime = Date.now() - startTime;
      
      if (response.status === 200) {
        console.log(`✅ Ping #${this.pingCount} successful - Response time: ${responseTime}ms`);
        this.failedPings = 0; // Reset failed ping counter
        
        // Log additional info every 6 pings (1 hour if pinging every 10 minutes)
        if (this.pingCount % 6 === 0) {
          console.log(`📊 Server kept alive - Total pings: ${this.pingCount}, Failed: ${this.failedPings}`);
        }
      } else {
        throw new Error(`Unexpected status code: ${response.status}`);
      }

    } catch (error) {
      this.failedPings++;
      console.error(`❌ Ping #${this.pingCount} failed:`, {
        error: error.message,
        code: error.code,
        failedPings: this.failedPings
      });

      // If we have too many failed pings, something might be wrong
      if (this.failedPings >= 5) {
        console.error(`🚨 Warning: ${this.failedPings} consecutive ping failures!`);
      }
    }
  }

  // Manual ping method for testing
  async testPing() {
    console.log('Testing server ping...');
    await this.ping();
  }

  getStats() {
    return {
      totalPings: this.pingCount,
      failedPings: this.failedPings,
      successRate: this.pingCount > 0 ? ((this.pingCount - this.failedPings) / this.pingCount * 100).toFixed(2) + '%' : 'N/A',
      isEnabled: this.isEnabled,
      serverUrl: this.serverUrl,
      pingInterval: this.pingInterval
    };
  }
}

let pingerInstance = null;

const initializePinger = () => {
  if (!pingerInstance) {
    pingerInstance = new ServerPinger();
    pingerInstance.init();
  }
  return pingerInstance;
};

const getPingerStats = () => {
  return pingerInstance ? pingerInstance.getStats() : null;
};

module.exports = { initializePinger, getPingerStats, ServerPinger };