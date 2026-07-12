import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { ExportService } from './export.service';

@Controller('videos/:videoId/export')
@UseGuards(AuthGuard('jwt'))
export class ExportController {
  constructor(private exportService: ExportService) {}

  @Get('xml')
  async exportXml(@Param('videoId') videoId: string, @Res() res: Response) {
    const xml = await this.exportService.exportXml(videoId);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="review_${videoId}.xml"`);
    return res.send(xml);
  }

  @Get('pdf')
  async exportPdf(@Param('videoId') videoId: string, @Res() res: Response) {
    const pdfBuffer = await this.exportService.exportPdf(videoId);
    
    // Check if it's actually PDF (starts with %PDF) or HTML fallback
    const isPdf = pdfBuffer.slice(0, 4).toString() === '%PDF';
    
    if (isPdf) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="review_${videoId}.pdf"`);
    } else {
      // Fallback to HTML
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `attachment; filename="review_${videoId}.html"`);
    }
    
    return res.send(pdfBuffer);
  }
}