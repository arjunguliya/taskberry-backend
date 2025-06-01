const nodemailer = require('nodemailer');

// Email transporter configuration
const createTransporter = () => {
  return nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD  // Use App Password for Gmail
    }
  });
};

// Generate password reset email HTML
const generatePasswordResetEmail = (resetUrl) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #f0f0f0; padding: 20px; text-align: center;">
        <h1 style="color: #333;">Chatzy TaskMaster</h1>
      </div>
      <div style="padding: 20px; border: 1px solid #ddd; background-color: #fff;">
        <h2>Password Reset Request</h2>
        <p>We received a request to reset your password for your Chatzy TaskMaster account.</p>
        <p>Please click the button below to reset your password. This link will expire in 1 hour.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">
            Reset Password
          </a>
        </div>
        <p>If you didn't request a password reset, you can safely ignore this email.</p>
        <p>If the button doesn't work, copy and paste this URL into your browser:</p>
        <p style="word-break: break-all; color: #666;">${resetUrl}</p>
      </div>
      <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
        <p>This is an automated email. Please do not reply.</p>
        <p>&copy; ${new Date().getFullYear()} Chatzy TaskMaster. All rights reserved.</p>
      </div>
    </div>
  `;
};

// Generate approval email HTML
const generateApprovalEmail = ({ name, role, approvedBy, loginUrl }) => {
  const roleDisplay = role.split('_').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');

  return {
    subject: '🎉 Your Chatzy TaskMaster Account Has Been Approved!',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Account Approved - TaskMaster</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .info-box { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #667eea; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🎉 Welcome to Chatzy TaskMaster!</h1>
          <p>Your account has been approved</p>
        </div>
        
        <div class="content">
          <h2>Hello ${name}!</h2>
          
          <p>Great news! Your Chatzy TaskMaster account has been approved by <strong>${approvedBy}</strong> and you can now access the platform.</p>
          
          <div class="info-box">
            <h3>Account Details:</h3>
            <ul>
              <li><strong>Name:</strong> ${name}</li>
              <li><strong>Role:</strong> ${roleDisplay}</li>
              <li><strong>Status:</strong> Active</li>
            </ul>
          </div>
          
          <p>You can now log in to your account and start collaborating with your team!</p>
          
          <div style="text-align: center;">
            <a href="${loginUrl}/login" class="button">Login to TaskMaster</a>
          </div>
          
          <h3>What's Next?</h3>
          <ul>
            <li>Complete your profile setup</li>
            <li>Explore the dashboard and available features</li>
            <li>Start collaborating with your team members</li>
            <li>Set up your notification preferences</li>
          </ul>
          
          <p>If you have any questions or need assistance getting started, please don't hesitate to reach out to your administrator or our support team.</p>
        </div>
        
        <div class="footer">
          <p>This email was sent from Chatzy TaskMaster. If you didn't expect this email, please contact support.</p>
          <p>© ${new Date().getFullYear()} TaskMaster. All rights reserved.</p>
        </div>
      </body>
      </html>
    `,
    text: `
      Welcome to Chatzy TaskMaster!
      
      Hello ${name},
      
      Your Chatzy TaskMaster account has been approved by ${approvedBy} and you can now access the platform.
      
      Account Details:
      - Name: ${name}
      - Role: ${roleDisplay}
      - Status: Active
      
      You can now log in at: ${loginUrl}/login
      
      What's Next?
      - Complete your profile setup
      - Explore the dashboard and available features
      - Start collaborating with your team members
      - Set up your notification preferences
      
      If you have questions, contact your administrator or support team.
      
      © ${new Date().getFullYear()} Chatzy TaskMaster. All rights reserved.
    `
  };
};

// Generate rejection email HTML
const generateRejectionEmail = ({ name, reason, adminEmail }) => {
  return {
    subject: 'Chatzy TaskMaster Account Application Update',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Application Status - TaskMaster</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f8f9fa; color: #333; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; border-bottom: 3px solid #dc3545; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .info-box { background: white; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #dc3545; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Chatzy TaskMaster Application Status</h1>
          <p>Application Update</p>
        </div>
        
        <div class="content">
          <h2>Hello ${name},</h2>
          
          <p>Thank you for your interest in joining Chatzy TaskMaster. After careful review, we're unable to approve your account application at this time.</p>
          
          ${reason ? `
          <div class="info-box">
            <h3>Reason:</h3>
            <p>${reason}</p>
          </div>
          ` : ''}
          
          <p>If you believe this is an error or would like to discuss your application, please contact the administrator at <strong>${adminEmail}</strong>.</p>
          
          <p>You're welcome to reapply in the future if your circumstances change.</p>
          
          <p>Thank you for your understanding.</p>
        </div>
        
        <div class="footer">
          <p>This email was sent from Chatzy TaskMaster. If you didn't expect this email, please contact support.</p>
          <p>© ${new Date().getFullYear()} TaskMaster. All rights reserved.</p>
        </div>
      </body>
      </html>
    `,
    text: `
      Chatzy TaskMaster Application Status
      
      Hello ${name},
      
      Thank you for your interest in joining Chatzy TaskMaster. After careful review, we're unable to approve your account application at this time.
      
      ${reason ? `Reason: ${reason}` : ''}
      
      If you believe this is an error or would like to discuss your application, please contact the administrator at ${adminEmail}.
      
      You're welcome to reapply in the future if your circumstances change.
      
      Thank you for your understanding.
      
      © ${new Date().getFullYear()} Chatzy TaskMaster. All rights reserved.
    `
  };
};

// Send password reset email
const sendPasswordResetEmail = async (email, resetToken) => {
  try {
    const transporter = createTransporter();
    
    // Create the reset URL (adjust based on your frontend URL)
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Reset Your Chatzy TaskMaster Password',
      html: generatePasswordResetEmail(resetUrl),
      text: `Reset your password by visiting: ${resetUrl}`
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return false;
  }
};

// Send approval email
const sendApprovalEmail = async ({ to, name, role, approvedBy, loginUrl }) => {
  try {
    console.log('Preparing approval email for:', { to, name, role, approvedBy });
    
    const transporter = createTransporter();
    
    // Verify transporter configuration
    await transporter.verify();
    console.log('Email transporter ready for approval email');
    
    const emailTemplate = generateApprovalEmail({ name, role, approvedBy, loginUrl });
    
    const mailOptions = {
      from: `"TaskMaster" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
      text: emailTemplate.text
    };
    
    console.log('Sending approval email to:', to);
    const result = await transporter.sendMail(mailOptions);
    console.log('Approval email sent successfully:', result.messageId);
    
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    console.error('Failed to send approval email:', error);
    throw new Error(`Failed to send approval email: ${error.message}`);
  }
};

// Send rejection email
const sendRejectionEmail = async ({ to, name, reason, adminEmail }) => {
  try {
    console.log('Preparing rejection email for:', { to, name, reason });
    
    const transporter = createTransporter();
    
    // Verify transporter configuration
    await transporter.verify();
    console.log('Email transporter ready for rejection email');
    
    const emailTemplate = generateRejectionEmail({ name, reason, adminEmail });
    
    const mailOptions = {
      from: `"TaskMaster" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
      text: emailTemplate.text
    };
    
    console.log('Sending rejection email to:', to);
    const result = await transporter.sendMail(mailOptions);
    console.log('Rejection email sent successfully:', result.messageId);
    
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    console.error('Failed to send rejection email:', error);
    throw new Error(`Failed to send rejection email: ${error.message}`);
  }
};

// Send general email
const sendEmail = async (to, subject, html, text = '') => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      html,
      text
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendApprovalEmail,
  sendRejectionEmail,
  sendEmail
};
