const { logger } = require('../utils/logger');

// Placeholder for email service
const sendEmail = async (data) => {
  logger.info('Sending email:', data.type);
  
  // TODO: Implement email sending
  throw new Error('Email service not yet implemented');
};

module.exports = {
  sendEmail,
};