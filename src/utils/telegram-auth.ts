import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import crypto from "crypto";

const AUTH_DIR = join(homedir(), ".sybil");
const AUTH_FILE = join(AUTH_DIR, "telegram-auth.json");

/**
 * OTP Entry for authentication
 */
interface OtpEntry {
  code: string;
  chatId: number;
  createdAt: string;
  expiresAt: string;
  used: boolean;
}

/**
 * Authenticated User
 */
interface AuthenticatedUser {
  chatId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  authenticatedAt: string;
}

/**
 * Ensure auth directory exists
 */
function ensureAuthDir(): void {
  if (!existsSync(AUTH_DIR)) {
    const { mkdirSync } = require("fs");
    mkdirSync(AUTH_DIR, { recursive: true });
  }
}

/**
 * Generate a random 6-digit OTP
 */
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Store OTP for a chat
 */
export function storeOTP(chatId: number, otp: string): void {
  ensureAuthDir();
  
  const otps = loadOTPs();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes

  // Remove any existing OTP for this chat
  const filtered = otps.filter((o: OtpEntry) => o.chatId !== chatId);
  
  filtered.push({
    code: otp,
    chatId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    used: false,
  });

  writeFileSync(AUTH_FILE, JSON.stringify({ 
    otps: filtered,
    users: loadUsers() 
  }, null, 2));
}

/**
 * Verify OTP for a chat
 */
export function verifyOTP(chatId: number, code: string): boolean {
  ensureAuthDir();
  
  const data = loadAuthData();
  const now = new Date();

  const otpEntry = data.otps.find((o: OtpEntry) => 
    o.chatId === chatId && 
    o.code === code && 
    !o.used &&
    new Date(o.expiresAt) > now
  );

  if (otpEntry) {
    // Mark as used
    otpEntry.used = true;
    
    // Add to authenticated users
    const existingUser = data.users.find((u: AuthenticatedUser) => u.chatId === chatId);
    if (!existingUser) {
      data.users.push({
        chatId,
        authenticatedAt: now.toISOString(),
      });
    }

    writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2));
    return true;
  }

  return false;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(chatId: number): boolean {
  if (!existsSync(AUTH_FILE)) return false;
  
  const data = loadAuthData();
  return data.users.some((u: AuthenticatedUser) => u.chatId === chatId);
}

/**
 * Get pending OTPs (for CLI display)
 */
export function getPendingOTPs(): OtpEntry[] {
  if (!existsSync(AUTH_FILE)) return [];
  
  const data = loadAuthData();
  const now = new Date();

  return data.otps.filter((o: OtpEntry) => 
    !o.used && 
    new Date(o.expiresAt) > now
  );
}

/**
 * Load auth data from file
 */
function loadAuthData(): { otps: OtpEntry[]; users: AuthenticatedUser[] } {
  if (!existsSync(AUTH_FILE)) {
    return { otps: [], users: [] };
  }

  try {
    const content = readFileSync(AUTH_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return { otps: [], users: [] };
  }
}

/**
 * Load OTPs
 */
function loadOTPs(): OtpEntry[] {
  return loadAuthData().otps;
}

/**
 * Load authenticated users
 */
function loadUsers(): AuthenticatedUser[] {
  return loadAuthData().users;
}

/**
 * Revoke authentication for a user
 */
export function revokeAuthentication(chatId: number): void {
  if (!existsSync(AUTH_FILE)) return;
  
  const data = loadAuthData();
  data.users = data.users.filter((u: AuthenticatedUser) => u.chatId !== chatId);
  
  writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2));
}

/**
 * Get all authenticated users (for CLI)
 */
export function getAuthenticatedUsers(): AuthenticatedUser[] {
  if (!existsSync(AUTH_FILE)) return [];
  return loadAuthData().users;
}

/**
 * Clean up expired OTPs
 */
export function cleanupExpiredOTPs(): void {
  if (!existsSync(AUTH_FILE)) return;
  
  const data = loadAuthData();
  const now = new Date();

  data.otps = data.otps.filter((o: OtpEntry) => 
    !o.used && new Date(o.expiresAt) > now
  );

  writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2));
}
