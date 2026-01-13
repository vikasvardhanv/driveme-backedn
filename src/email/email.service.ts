import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
    private transporter: nodemailer.Transporter;
    private readonly logger = new Logger(EmailService.name);
    private readonly fromAddress: string;

    constructor() {
        const isProduction = process.env.NODE_ENV === 'production';
        const host = process.env.SMTP_HOST;
        const port = Number.parseInt(process.env.SMTP_PORT ?? '', 10) || 587;
        const user = process.env.SMTP_USER;
        const pass = process.env.SMTP_PASS;
        this.fromAddress = process.env.SMTP_FROM ?? '"YazDrive System" <system@yazdrive.com>';

        if (!host || !user || !pass) {
            const message = 'SMTP configuration is missing; email sending is disabled.';
            this.logger.warn(message);
            this.transporter = nodemailer.createTransport({ jsonTransport: true });
            return;
        }

        this.transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: {
                user,
                pass,
            },
        });
    }

    async sendTripReport(
        to: string,
        tripId: string,
        pdfBuffer: Buffer,
        tripDetails?: {
            driverName: string;
            memberName: string;
            date: string;
            pickupAddress: string;
            dropoffAddress: string;
        },
    ) {
        try {
            const filename = `AHCCCS_Daily_Trip_Report_${tripId}_${Date.now()}.pdf`;

            const info = await this.transporter.sendMail({
                from: this.fromAddress,
                to,
                subject: tripDetails
                    ? `AHCCCS Daily Trip Report - ${tripDetails.date}`
                    : `Daily Trip Report: ${tripId}`,
                html: tripDetails
                    ? this.generateTripReportEmailTemplate(tripDetails)
                    : '<p>Please find attached the signed AHCCCS Daily Trip Report.</p>',
                text: 'Please find attached the signed AHCCCS Daily Trip Report.',
                attachments: [
                    {
                        filename,
                        content: pdfBuffer,
                        contentType: 'application/pdf',
                    },
                ],
            });
            this.logger.log(`Email sent: ${info.messageId}`);
        } catch (error) {
            this.logger.error('Failed to send email', error);
            throw error;
        }
    }

    async sendDriverWelcomeEmail(
        driverEmail: string,
        driverName: string,
        tempPassword: string,
    ): Promise<void> {
        try {
            this.logger.log(`Sending welcome email to driver ${driverEmail}`);

            const info = await this.transporter.sendMail({
                from: this.fromAddress,
                to: driverEmail,
                subject: 'Welcome to YazTrans - Driver Account Created',
                html: this.generateDriverWelcomeTemplate(
                    driverName,
                    driverEmail,
                    tempPassword,
                ),
            });

            this.logger.log(`Welcome email sent: ${info.messageId}`);
        } catch (error) {
            this.logger.error(
                `Failed to send welcome email to ${driverEmail}`,
                error,
            );
            // Don't throw - account creation should succeed even if email fails
        }
    }

    private generateTripReportEmailTemplate(tripDetails: {
        driverName: string;
        memberName: string;
        date: string;
        pickupAddress: string;
        dropoffAddress: string;
    }): string {
        return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #0066cc; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none; }
          .detail-row { margin: 10px 0; padding: 10px; background-color: white; border-left: 3px solid #0066cc; }
          .label { font-weight: bold; color: #0066cc; }
          .footer { margin-top: 20px; padding: 15px; background-color: #f0f0f0; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 5px 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h2>AHCCCS Daily Trip Report</h2></div>
          <div class="content">
            <p>Dear NEMT Provider,</p>
            <p>Please find attached the AHCCCS Daily Trip Report for the completed trip:</p>
            <div class="detail-row"><span class="label">Date:</span> ${tripDetails.date}</div>
            <div class="detail-row"><span class="label">Driver:</span> ${tripDetails.driverName}</div>
            <div class="detail-row"><span class="label">Member:</span> ${tripDetails.memberName}</div>
            <div class="detail-row"><span class="label">Pickup:</span> ${tripDetails.pickupAddress}</div>
            <div class="detail-row"><span class="label">Dropoff:</span> ${tripDetails.dropoffAddress}</div>
            <p style="margin-top: 20px;">The completed AHCCCS Daily Trip Report PDF is attached for your records.</p>
            <p>Thank you,<br><strong>YazTrans NEMT Services</strong></p>
          </div>
          <div class="footer">
            This is an automated message from YazTrans NEMT Management System.<br>Please do not reply to this email.
          </div>
        </div>
      </body>
      </html>
    `;
    }

    private generateDriverWelcomeTemplate(
        driverName: string,
        email: string,
        tempPassword: string,
    ): string {
        return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #0066cc; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none; }
          .credentials { background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px; }
          .footer { margin-top: 20px; padding: 15px; background-color: #f0f0f0; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 5px 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header"><h2>Welcome to YazTrans!</h2></div>
          <div class="content">
            <p>Hello ${driverName},</p>
            <p>Your driver account has been successfully created with YazTrans NEMT Services.</p>
            <div class="credentials">
              <h3 style="margin-top: 0;">Your Login Credentials:</h3>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Temporary Password:</strong> ${tempPassword}</p>
              <p style="color: #856404; margin-top: 15px;">⚠️ <strong>Important:</strong> Please change your password after your first login.</p>
            </div>
            <p><strong>Next Steps:</strong></p>
            <ol>
              <li>Download the YazTrans Driver App</li>
              <li>Log in with your email and temporary password</li>
              <li>Complete your driver profile</li>
              <li>Start accepting trip assignments</li>
            </ol>
            <p>Best regards,<br><strong>The YazTrans Team</strong></p>
          </div>
          <div class="footer">YazTrans NEMT Services<br>For support: support@yaztrans.com</div>
        </div>
      </body>
      </html>
    `;
    }
}
