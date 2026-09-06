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
   * In production the link is NEVER logged: reset/invite links printed to
   * server logs would let anyone with log access take over an account.
   */
  async send(to: string, subject: string, html: string, devLogLink?: string): Promise<void> {
    if (!this.transporter) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.warn(
          `SMTP chưa cấu hình — KHÔNG gửi được mail tới ${to} (subject: ${subject}). Cấu hình SMTP_HOST để bật email.`,
        );
      } else {
        this.logger.log(`[DEV MAIL] To: ${to} | Subject: ${subject}${devLogLink ? ` | Link: ${devLogLink}` : ''}`);
      }
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
