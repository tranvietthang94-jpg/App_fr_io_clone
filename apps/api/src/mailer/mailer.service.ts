import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    if (process.env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
    }
  }

  /**
   * Sends an email, or logs it (with the dev-relevant link) if no SMTP_HOST
   * is configured — keeps local dev working without real mail credentials.
   */
  async send(to: string, subject: string, html: string, devLogLink?: string): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[DEV MAIL] To: ${to} | Subject: ${subject}${devLogLink ? ` | Link: ${devLogLink}` : ''}`);
      return;
    }
    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'no-reply@frameclone.local',
        to,
        subject,
        html,
      });
    } catch (err: any) {
      this.logger.error(`Failed to send email to ${to}: ${err.message}`);
    }
  }
}
