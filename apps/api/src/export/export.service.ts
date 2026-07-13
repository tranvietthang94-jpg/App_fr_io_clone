import { Injectable, Logger } from '@nestjs/common';
import { CommentsService } from '../comments/comments.service';
import { VideosService } from '../videos/videos.service';
import { ProjectsService } from '../projects/projects.service';
import * as puppeteer from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { spawn } from 'child_process';

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private commentsService: CommentsService,
    private videosService: VideosService,
    private projectsService: ProjectsService,
  ) {}

  /**
   * Export XML theo format XMEML v4 - Premiere Pro compatible
   * Clone 100% từ frame.io
   */
  async exportXml(videoId: string): Promise<string> {
    const video = await this.videosService.findOne(videoId);
    const comments = await this.commentsService.findByVideo(videoId);

    const sequenceUuid = uuidv4();
    const totalFrames = Math.floor(video.duration * video.fps);
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}-${now.getMinutes().toString().padStart(2,'0')}-${now.getSeconds().toString().padStart(2,'0')}`;

    // Build markers XML
    const markersXml = comments.map(c => {
      const frame = Math.floor(c.timestamp * video.fps);
      const commentText = this.escapeXml(c.content);
      const userName = this.escapeXml(c.user?.name || 'Unknown');
      return `  <marker>
    <comment>${commentText}</comment>
    <name>${userName}</name>
    <in>${frame}</in>
    <out>-1</out>
    <pproColor>4294741314</pproColor>
  </marker>`;
    }).join('\n');

    // Build complete XMEML v4 XML
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence id="sequence" TL.SQAudioVisibleBase="0" TL.SQVideoVisibleBase="0" TL.SQVisibleBaseTime="0" TL.SQAVDividerPosition="0.5" TL.SQHideShyTracks="0" TL.SQHeaderWidth="292" Monitor.ProgramZoomOut="0" Monitor.ProgramZoomIn="0" TL.SQTimePerPixel="0.19999999999999998" MZ.EditLine="0" MZ.Sequence.PreviewFrameSizeHeight="${video.height}" MZ.Sequence.PreviewFrameSizeWidth="${video.width}" MZ.Sequence.AudioTimeDisplayFormat="200" MZ.Sequence.PreviewRenderingClassID="1061109567" MZ.Sequence.PreviewRenderingPresetCodec="1634755439" MZ.Sequence.PreviewRenderingPresetPath="EncoderPresets/SequencePreview/795454d9-d3c2-429d-9474-923ab13b7018/QuickTime.epr" MZ.Sequence.PreviewUseMaxRenderQuality="false" MZ.Sequence.PreviewUseMaxBitDepth="false" MZ.Sequence.EditingModeGUID="795454d9-d3c2-429d-9474-923ab13b7018" MZ.Sequence.VideoTimeDisplayFormat="101" MZ.WorkOutPoint="${totalFrames * 40000}" MZ.WorkInPoint="0" explodedTracks="true">
    <uuid>${sequenceUuid}</uuid>
    <duration>${totalFrames}</duration>
    <rate>
      <timebase>${Math.floor(video.fps)}</timebase>
      <ntsc>FALSE</ntsc>
    </rate>
    <name>${this.escapeXml(video.title)} ${dateStr}</name>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <rate>
              <timebase>${Math.floor(video.fps)}</timebase>
              <ntsc>FALSE</ntsc>
            </rate>
            <codec>
              <name>Apple ProRes 422</name>
              <appspecificdata>
                <appname>Final Cut Pro</appname>
                <appmanufacturer>Apple Inc.</appmanufacturer>
                <appversion>7.0</appversion>
                <data>
                  <qtcodec>
                    <codecname>Apple ProRes 422</codecname>
                    <codectypename>Apple ProRes 422</codectypename>
                    <codecname>Apple ProRes 422</codecname>
                    <codectypecode>apcn</codectypecode>
                    <codecvendorcode>appl</codecvendorcode>
                    <spatialquality>1024</spatialquality>
                    <temporalquality>0</temporalquality>
                    <keyframerate>0</keyframerate>
                    <datarate>0</datarate>
                  </qtcodec>
                </data>
              </appspecificdata>
            </codec>
            <width>${video.width}</width>
            <height>${video.height}</height>
            <anamorphic>FALSE</anamorphic>
            <pixelaspectratio>square</pixelaspectratio>
            <fielddominance>none</fielddominance>
            <colordepth>24</colordepth>
          </samplecharacteristics>
        </format>
        <track TL.SQTrackShy="0" TL.SQTrackExpandedHeight="25" TL.SQTrackExpanded="0" MZ.TrackTargeted="0">
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
          <generatoritem id="clipitem-1">
            <name>Marker Color Matte (${dateStr})</name>
            <enabled>TRUE</enabled>
            <duration>${totalFrames}</duration>
            <rate>
              <timebase>${Math.floor(video.fps)}</timebase>
              <ntsc>FALSE</ntsc>
            </rate>
            <start>0</start>
            <end>${totalFrames}</end>
            <in>0</in>
            <out>${totalFrames}</out>
            <alphatype>none</alphatype>
            <effect>
              <name>Color</name>
              <effectid>Color</effectid>
              <effectcategory>Matte</effectcategory>
              <effecttype>generator</effecttype>
              <mediatype>video</mediatype>
              <parameter authoringApp="PremierePro">
                <parameterid>fillcolor</parameterid>
                <name>Color</name>
                <value>
                  <alpha>0</alpha>
                  <red>0</red>
                  <green>0</green>
                  <blue>0</blue>
                </value>
              </parameter>
            </effect>
            <filter>
              <effect>
                <name>Opacity</name>
                <effectid>opacity</effectid>
                <effectcategory>motion</effectcategory>
                <effecttype>motion</effecttype>
                <mediatype>video</mediatype>
                <pproBypass>false</pproBypass>
                <parameter authoringApp="PremierePro">
                  <parameterid>opacity</parameterid>
                  <name>opacity</name>
                  <valuemin>0</valuemin>
                  <valuemax>100</valuemax>
                  <value>0</value>
                </parameter>
              </effect>
            </filter>
${markersXml}
          </generatoritem>
        </track>
      </video>
      <audio>
        <numOutputChannels>2</numOutputChannels>
        <format>
          <samplecharacteristics>
            <depth>16</depth>
            <samplerate>48000</samplerate>
          </samplecharacteristics>
        </format>
        <outputs>
          <groups>
            <index>1</index>
            <numchannels>1</numchannels>
            <downmix>0</downmix>
            <channel>
              <index>1</index>
            </channel>
          </groups>
          <groups>
            <index>2</index>
            <numchannels>1</numchannels>
            <downmix>0</downmix>
            <channel>
              <index>2</index>
            </channel>
          </groups>
        </outputs>
        <track TL.SQTrackAudioKeyframeStyle="0" TL.SQTrackShy="0" TL.SQTrackExpandedHeight="25" TL.SQTrackExpanded="0" MZ.TrackTargeted="1" PannerCurrentValue="0.5" PannerIsInverted="true" PannerStartKeyframe="-91445760000000000,0.5,0,0,0,0,0,0" PannerName="Balance" currentExplodedTrackIndex="0" totalExplodedTrackCount="2" premiereTrackType="Stereo">
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
          <outputchannelindex>1</outputchannelindex>
        </track>
        <track TL.SQTrackAudioKeyframeStyle="0" TL.SQTrackShy="0" TL.SQTrackExpandedHeight="25" TL.SQTrackExpanded="0" MZ.TrackTargeted="1" PannerCurrentValue="0.5" PannerIsInverted="true" PannerStartKeyframe="-91445760000000000,0.5,0,0,0,0,0,0" PannerName="Balance" currentExplodedTrackIndex="1" totalExplodedTrackCount="2" premiereTrackType="Stereo">
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
          <outputchannelindex>2</outputchannelindex>
        </track>
        <track TL.SQTrackAudioKeyframeStyle="0" TL.SQTrackShy="0" TL.SQTrackExpandedHeight="25" TL.SQTrackExpanded="0" MZ.TrackTargeted="1" PannerCurrentValue="0.5" PannerIsInverted="true" PannerStartKeyframe="-91445760000000000,0.5,0,0,0,0,0,0" PannerName="Balance" currentExplodedTrackIndex="0" totalExplodedTrackCount="2" premiereTrackType="Stereo">
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
          <outputchannelindex>1</outputchannelindex>
        </track>
        <track TL.SQTrackAudioKeyframeStyle="0" TL.SQTrackShy="0" TL.SQTrackExpandedHeight="25" TL.SQTrackExpanded="0" MZ.TrackTargeted="1" PannerCurrentValue="0.5" PannerIsInverted="true" PannerStartKeyframe="-91445760000000000,0.5,0,0,0,0,0,0" PannerName="Balance" currentExplodedTrackIndex="1" totalExplodedTrackCount="2" premiereTrackType="Stereo">
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
          <outputchannelindex>2</outputchannelindex>
        </track>
        <track TL.SQTrackAudioKeyframeStyle="0" TL.SQTrackShy="0" TL.SQTrackExpandedHeight="25" TL.SQTrackExpanded="0" MZ.TrackTargeted="1" PannerCurrentValue="0.5" PannerIsInverted="true" PannerStartKeyframe="-91445760000000000,0.5,0,0,0,0,0,0" PannerName="Balance" currentExplodedTrackIndex="0" totalExplodedTrackCount="2" premiereTrackType="Stereo">
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
          <outputchannelindex>1</outputchannelindex>
        </track>
        <track TL.SQTrackAudioKeyframeStyle="0" TL.SQTrackShy="0" TL.SQTrackExpandedHeight="25" TL.SQTrackExpanded="0" MZ.TrackTargeted="1" PannerCurrentValue="0.5" PannerIsInverted="true" PannerStartKeyframe="-91445760000000000,0.5,0,0,0,0,0,0" PannerName="Balance" currentExplodedTrackIndex="1" totalExplodedTrackCount="2" premiereTrackType="Stereo">
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
          <outputchannelindex>2</outputchannelindex>
        </track>
        <track TL.SQTrackAudioKeyframeStyle="0" TL.SQTrackShy="0" TL.SQTrackExpandedHeight="25" TL.SQTrackExpanded="0" MZ.TrackTargeted="1" PannerCurrentValue="0.5" PannerIsInverted="true" PannerStartKeyframe="-91445760000000000,0.5,0,0,0,0,0,0" PannerName="Balance" currentExplodedTrackIndex="0" totalExplodedTrackCount="2" premiereTrackType="Stereo">
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
          <outputchannelindex>1</outputchannelindex>
        </track>
        <track TL.SQTrackAudioKeyframeStyle="0" TL.SQTrackShy="0" TL.SQTrackExpandedHeight="25" TL.SQTrackExpanded="0" MZ.TrackTargeted="1" PannerCurrentValue="0.5" PannerIsInverted="true" PannerStartKeyframe="-91445760000000000,0.5,0,0,0,0,0,0" PannerName="Balance" currentExplodedTrackIndex="1" totalExplodedTrackCount="2" premiereTrackType="Stereo">
          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
          <outputchannelindex>2</outputchannelindex>
        </track>
      </audio>
    </media>
    <timecode>
      <rate>
        <timebase>${Math.floor(video.fps)}</timebase>
        <ntsc>FALSE</ntsc>
      </rate>
      <string>00:00:00:00</string>
      <frame>0</frame>
      <displayformat>NDF</displayformat>
    </timecode>
    <labels>
      <label2>Iris</label2>
    </labels>
    <logginginfo>
      <description/>
      <scene/>
      <shottake/>
      <lognote/>
      <good/>
      <originalvideofilename/>
      <originalaudiofilename/>
    </logginginfo>
${markersXml}
  </sequence>
</xmeml>`;

    return xml;
  }

  /**
   * Capture screenshot từ video tại timestamp cụ thể
   */
  async captureScreenshot(videoPath: string, timestamp: number, outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        '-ss', timestamp.toString(),
        '-i', videoPath,
        '-vframes', '1',
        '-q:v', '2',
        '-y',
        outputPath,
      ];

      const ffmpeg = spawn('ffmpeg', args);
      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          this.logger.error(`Screenshot capture failed: ${stderr}`);
          reject(new Error(`ffmpeg exited with code ${code}`));
          return;
        }
        resolve(outputPath);
      });
    });
  }

  /**
   * Export PDF - Frame.io style với screenshots
   */
  async exportPdf(videoId: string): Promise<Buffer> {
    const video = await this.videosService.findOne(videoId);
    const comments = await this.commentsService.findByVideo(videoId);

    // Create temp dir for screenshots
    const tempDir = path.join(process.cwd(), 'uploads', 'temp', videoId);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Capture screenshots for each comment
    const screenshots: Array<{ comment: any; screenshotPath: string }> = [];
    
    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i];
      const screenshotPath = path.join(tempDir, `frame_${i}.jpg`);
      
      try {
        await this.captureScreenshot(video.filePath, comment.timestamp, screenshotPath);
        screenshots.push({ comment, screenshotPath });
      } catch (error: any) {
        this.logger.warn(`Failed to capture screenshot for comment ${comment.id}: ${error.message}`);
        screenshots.push({ comment, screenshotPath: '' });
      }
    }

    // Generate HTML for PDF
    const now = new Date().toLocaleString('vi-VN');
    const totalFrames = Math.floor(video.duration * video.fps);

    const commentsHtml = screenshots.map((s, i) => {
      const c = s.comment;
      const frame = Math.floor(c.timestamp * video.fps);
      const timecode = this.formatTimecode(c.timestamp, video.fps);
      const screenshotBase64 = s.screenshotPath && fs.existsSync(s.screenshotPath)
        ? `data:image/jpeg;base64,${fs.readFileSync(s.screenshotPath).toString('base64')}`
        : '';

      return `
        <div class="comment-block">
          <div class="comment-header">
            <div class="comment-number">#${i + 1}</div>
            <div class="comment-meta">
              <span class="comment-user">${this.escapeHtml(c.user?.name || 'Unknown')}</span>
              <span class="comment-time">${timecode} | Frame ${frame}</span>
            </div>
          </div>
          ${screenshotBase64 ? `<div class="screenshot"><img src="${screenshotBase64}" /></div>` : ''}
          <div class="comment-content">${this.escapeHtml(c.content)}</div>
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; line-height: 1.5; }
    
    .header {
      background: #1a1a2e;
      color: white;
      padding: 24px 30px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-left h1 { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
    .header-left p { font-size: 13px; opacity: 0.8; }
    .header-right { text-align: right; font-size: 12px; opacity: 0.7; }
    
    .info-bar {
      display: flex;
      gap: 20px;
      padding: 12px 20px;
      background: #f5f5f5;
      border-radius: 6px;
      margin-bottom: 20px;
      font-size: 12px;
    }
    .info-item { display: flex; gap: 6px; }
    .info-label { color: #666; }
    .info-value { font-weight: 600; color: #1a1a1a; }
    
    .comment-block {
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      margin-bottom: 16px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .comment-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      background: #f8f9fa;
      border-bottom: 1px solid #e0e0e0;
    }
    .comment-number {
      background: #0ea5e9;
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
    }
    .comment-meta { display: flex; flex-direction: column; }
    .comment-user { font-weight: 600; font-size: 13px; }
    .comment-time { font-size: 11px; color: #666; }
    
    .screenshot {
      background: #000;
      display: flex;
      justify-content: center;
      align-items: center;
      max-height: 300px;
      overflow: hidden;
    }
    .screenshot img {
      width: 100%;
      max-height: 300px;
      object-fit: contain;
    }
    
    .comment-content {
      padding: 12px 16px;
      font-size: 14px;
      color: #333;
    }
    
    .footer {
      margin-top: 20px;
      padding-top: 12px;
      border-top: 1px solid #e0e0e0;
      text-align: center;
      font-size: 11px;
      color: #999;
    }
    
    .no-comments {
      text-align: center;
      padding: 40px;
      color: #999;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>${this.escapeHtml(video.title)}</h1>
      <p>Video Review Report</p>
    </div>
    <div class="header-right">
      <div>Exported: ${now}</div>
      <div>${comments.length} comment${comments.length !== 1 ? 's' : ''}</div>
    </div>
  </div>
  
  <div class="info-bar">
    <div class="info-item">
      <span class="info-label">Duration:</span>
      <span class="info-value">${this.formatDuration(video.duration)}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Resolution:</span>
      <span class="info-value">${video.width}x${video.height}</span>
    </div>
    <div class="info-item">
      <span class="info-label">FPS:</span>
      <span class="info-value">${video.fps}</span>
    </div>
    <div class="info-item">
      <span class="info-label">Frames:</span>
      <span class="info-value">${totalFrames}</span>
    </div>
  </div>
  
  ${comments.length === 0 ? '<div class="no-comments">No comments yet</div>' : commentsHtml}
  
  <div class="footer">
    Generated by Frame.io Clone | ${now}
  </div>
</body>
</html>`;

    // Generate PDF
    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
      });

      await browser.close();
      
      // Cleanup temp screenshots
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {
        // ignore cleanup errors
      }
      
      return Buffer.from(pdfBuffer);
    } catch (error: any) {
      this.logger.error(`PDF generation failed: ${error.message}`);
      // Cleanup on error
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) {}
      return Buffer.from(html);
    }
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  private formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private formatTimecode(seconds: number, fps: number): string {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * fps);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  }
}