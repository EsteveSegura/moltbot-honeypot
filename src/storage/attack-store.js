/**
 * Attack Store
 *
 * Stores captured attack data in memory and persists to disk.
 * Provides methods for querying attack data for the admin UI.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import config from '../config/index.js';

class AttackStore {
  constructor() {
    this.attacks = [];
    this.stats = {
      totalHttpRequests: 0,
      totalWsConnections: 0,
      totalWsMessages: 0,
      uniqueIps: new Set(),
      attacksByType: {},
      attacksByEndpoint: {},
      startTime: Date.now(),
    };
    this.dataDir = config.storage.dataDir;
    this.maxInMemory = config.storage.maxAttacksInMemory;

    this._ensureDataDir();
    this._loadExistingData();
  }

  _ensureDataDir() {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  _loadExistingData() {
    const statsFile = join(this.dataDir, 'stats.json');
    if (existsSync(statsFile)) {
      try {
        const data = JSON.parse(readFileSync(statsFile, 'utf-8'));
        this.stats = {
          ...data,
          uniqueIps: new Set(data.uniqueIps || []),
          startTime: data.startTime || Date.now(),
        };
      } catch (err) {
        console.error('[AttackStore] Failed to load stats:', err.message);
      }
    }
  }

  _saveStats() {
    const statsFile = join(this.dataDir, 'stats.json');
    try {
      const data = {
        ...this.stats,
        uniqueIps: Array.from(this.stats.uniqueIps),
      };
      writeFileSync(statsFile, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('[AttackStore] Failed to save stats:', err.message);
    }
  }

  _appendToLog(attack) {
    const today = new Date().toISOString().split('T')[0];
    const logFile = join(this.dataDir, `attacks-${today}.jsonl`);
    try {
      appendFileSync(logFile, JSON.stringify(attack) + '\n');
    } catch (err) {
      console.error('[AttackStore] Failed to append to log:', err.message);
    }
  }

  /**
   * Record an HTTP request attack
   */
  recordHttpRequest(data) {
    const attack = {
      id: `http-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      type: 'http',
      timestamp: new Date().toISOString(),
      ip: data.ip,
      method: data.method,
      path: data.path,
      headers: data.headers,
      body: data.body,
      userAgent: data.userAgent,
      category: this._categorizeAttack(data),
    };

    this._addAttack(attack);
    this.stats.totalHttpRequests++;
    this.stats.uniqueIps.add(data.ip);
    this._incrementEndpointStat(data.path);
    this._incrementTypeStat(attack.category);
    this._saveStats();

    return attack;
  }

  /**
   * Record a WebSocket connection
   */
  recordWsConnection(data) {
    const attack = {
      id: `ws-conn-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      type: 'ws_connection',
      timestamp: new Date().toISOString(),
      ip: data.ip,
      headers: data.headers,
      category: 'ws_connect',
    };

    this._addAttack(attack);
    this.stats.totalWsConnections++;
    this.stats.uniqueIps.add(data.ip);
    this._incrementTypeStat('ws_connect');
    this._saveStats();

    return attack;
  }

  /**
   * Record a WebSocket message
   */
  recordWsMessage(data) {
    const attack = {
      id: `ws-msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      type: 'ws_message',
      timestamp: new Date().toISOString(),
      ip: data.ip,
      clientId: data.clientId,
      message: data.message,
      method: data.message?.method,
      category: this._categorizeWsMessage(data.message),
    };

    this._addAttack(attack);
    this.stats.totalWsMessages++;
    this._incrementTypeStat(attack.category);
    this._saveStats();

    return attack;
  }

  _addAttack(attack) {
    this.attacks.push(attack);
    this._appendToLog(attack);

    // Keep memory usage bounded
    if (this.attacks.length > this.maxInMemory) {
      this.attacks = this.attacks.slice(-this.maxInMemory);
    }
  }

  _categorizeAttack(data) {
    const path = data.path?.toLowerCase() || '';
    const body = JSON.stringify(data.body || '').toLowerCase();

    if (path.includes('/tools/invoke')) return 'tool_invoke';
    if (path.includes('/v1/chat/completions')) {
      if (body.includes('ignore') || body.includes('system') || body.includes('jailbreak')) {
        return 'prompt_injection';
      }
      return 'chat_completion';
    }
    if (path.includes('/v1/responses')) return 'openresponses';
    if (path.includes('/v1/models')) return 'reconnaissance';
    if (path === '/') return 'ui_access';
    if (path.includes('/health')) return 'health_check';
    return 'other';
  }

  _categorizeWsMessage(message) {
    if (!message) return 'malformed';
    const method = message.method?.toLowerCase() || '';

    if (method === 'connect') return 'ws_auth';
    if (method === 'send') return 'ws_send';
    if (method === 'agent') return 'ws_agent';
    if (method === 'health') return 'ws_health';
    return 'ws_other';
  }

  _incrementEndpointStat(endpoint) {
    this.stats.attacksByEndpoint[endpoint] = (this.stats.attacksByEndpoint[endpoint] || 0) + 1;
  }

  _incrementTypeStat(type) {
    this.stats.attacksByType[type] = (this.stats.attacksByType[type] || 0) + 1;
  }

  /**
   * Get recent attacks for the admin UI
   */
  getRecentAttacks(limit = 100, offset = 0) {
    const sorted = this.attacks.slice().reverse();
    return sorted.slice(offset, offset + limit);
  }

  /**
   * Get attacks filtered by type
   */
  getAttacksByType(type, limit = 100) {
    return this.attacks
      .filter(a => a.category === type || a.type === type)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get statistics summary
   */
  getStats() {
    return {
      totalHttpRequests: this.stats.totalHttpRequests,
      totalWsConnections: this.stats.totalWsConnections,
      totalWsMessages: this.stats.totalWsMessages,
      uniqueIps: this.stats.uniqueIps.size,
      attacksByType: this.stats.attacksByType,
      attacksByEndpoint: this.stats.attacksByEndpoint,
      uptimeMs: Date.now() - this.stats.startTime,
      attacksInMemory: this.attacks.length,
    };
  }

  /**
   * Get unique IPs
   */
  getUniqueIps() {
    return Array.from(this.stats.uniqueIps);
  }
}

// Singleton instance
export const attackStore = new AttackStore();
export default attackStore;
