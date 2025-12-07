/**
 * Timezone utilities for consistent IST handling on the backend
 */

const IST_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30 in milliseconds

/**
 * Get current time in IST
 * @returns {Date} - Date object representing current IST time
 */
const getCurrentISTTime = () => {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: IST_TIMEZONE }));
};

/**
 * Get current UTC time (for database storage and comparisons)
 * @returns {Date} - Date object representing current UTC time
 */
const getCurrentUTCTime = () => {
  return new Date();
};

/**
 * Convert IST time to UTC for database storage
 * @param {Date|string} istTime - IST time to convert
 * @returns {Date} - UTC Date object
 */
const convertISTToUTC = (istTime) => {
  if (!istTime) return null;
  
  const date = new Date(istTime);
  if (isNaN(date.getTime())) return null;
  
  // If this is already a proper UTC time, return as is
  return new Date(date.getTime());
};

/**
 * Convert UTC time to IST for display
 * @param {Date|string} utcTime - UTC time to convert
 * @returns {Date} - IST Date object
 */
const convertUTCToIST = (utcTime) => {
  if (!utcTime) return null;
  
  const date = new Date(utcTime);
  if (isNaN(date.getTime())) return null;
  
  return new Date(date.toLocaleString('en-US', { timeZone: IST_TIMEZONE }));
};

/**
 * Format date for IST display (dd/mm/yyyy format)
 * @param {Date|string} date - Date to format
 * @returns {string} - Formatted date string
 */
const formatDateIST = (date) => {
  if (!date) return 'N/A';
  
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) return 'Invalid Date';
  
  // Convert to IST for display
  const istDate = new Date(dateObj.toLocaleString('en-US', { timeZone: IST_TIMEZONE }));
  
  const day = String(istDate.getDate()).padStart(2, '0');
  const month = String(istDate.getMonth() + 1).padStart(2, '0');
  const year = istDate.getFullYear();
  
  return `${day}/${month}/${year}`;
};

/**
 * Format datetime for IST display (dd/mm/yyyy hh:mm format)
 * @param {Date|string} date - Date to format
 * @returns {string} - Formatted datetime string
 */
const formatDateTimeIST = (date) => {
  if (!date) return 'N/A';
  
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) return 'Invalid Date';
  
  // Convert to IST for display
  const istDate = new Date(dateObj.toLocaleString('en-US', { timeZone: IST_TIMEZONE }));
  
  const day = String(istDate.getDate()).padStart(2, '0');
  const month = String(istDate.getMonth() + 1).padStart(2, '0');
  const year = istDate.getFullYear();
  const hours = String(istDate.getHours()).padStart(2, '0');
  const minutes = String(istDate.getMinutes()).padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

/**
 * Check if a scheduled time has arrived (comparing UTC times)
 * @param {Date|string} scheduledTime - UTC scheduled time from database
 * @returns {boolean} - True if the scheduled time has arrived
 */
const isScheduledTimeReached = (scheduledTime) => {
  if (!scheduledTime) return false;
  
  const now = getCurrentUTCTime();
  const scheduled = new Date(scheduledTime);
  
  return scheduled <= now;
};

/**
 * Log with IST timestamp for better debugging
 * @param {string} message - Message to log
 * @param {...any} args - Additional arguments
 */
const logWithISTTime = (message, ...args) => {
  const istTime = formatDateTimeIST(new Date());
  console.log(`[${istTime} IST] ${message}`, ...args);
};

module.exports = {
  IST_TIMEZONE,
  IST_OFFSET_MS,
  getCurrentISTTime,
  getCurrentUTCTime,
  convertISTToUTC,
  convertUTCToIST,
  formatDateIST,
  formatDateTimeIST,
  isScheduledTimeReached,
  logWithISTTime
};