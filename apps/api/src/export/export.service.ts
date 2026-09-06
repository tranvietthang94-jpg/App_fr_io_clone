import { Injectable, Logger } from '@nestjs/common';
import { CommentsService } from '../comments/comments.service';
import { AnnotationsService } from '../comments/annotations.service';
import { Annotation } from '../comments/annotation.entity';
import { VideosService } from '../videos/videos.service';
import { ProjectsService } from '../projects/projects.service';
import * as puppeteer from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { spawn } from 'child_process';
import { armProcessKillTimer } from '../common/process-timeout.util';

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);
  private readonly ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

  // Reverse-engineered from the reference export in DEMO/HXM_EPISODE 10_HGE_01.xml:
  // MZ.WorkOutPoint there is exactly (254016000000 / 25) * 454 — Premiere's
  // documented ticks-per-second constant times a small, fixed frame count that
  // has no relation to that video's actual 8654-frame duration. Every other
  // MZ.* attribute in this same template (PreviewRenderingClassID, EditingModeGUID,
  // etc.) is likewise a hardcoded Premiere timeline-panel constant, not derived
  // from the video, so this is kept as a fixed value to match. ponytail: only
  // one real Frame.io sample was available to verify this against — if a second
  // export at a different duration/fps ever contradicts it, replace with the
  // correct per-video formula.
  private readonly WORK_OUT_POINT = '4612930560000';
  private readonly VN_TIMEZONE = 'Asia/Ho_Chi_Minh';

  constructor(
    private commentsService: CommentsService,
    private annotationsService: AnnotationsService,
    private videosService: VideosService,
    private projectsService: ProjectsService,
  ) {}

  /**
   * Export XML theo format XMEML v4 - Premiere Pro compatible
   * Clone 100% từ frame.io
   */
  async exportXml(videoId: string): Promise<string> {
    const video = await this.videosService.findOne(videoId);
    const { items: comments } = await this.commentsService.findByVideo(videoId);

    const fps = video.fps || 30;
    const timebase = Math.max(1, Math.round(fps));
    const ntsc = Math.abs(fps - timebase) > 0.001 ? 'TRUE' : 'FALSE';
    const sequenceUuid = uuidv4();
    const totalFrames = Math.round(video.duration * fps);
    const dateStr = this.formatXmlDateStr(new Date());

    // Build markers XML
    const markersXml = comments.map(c => {
      const frame = Math.round(c.timestamp * fps);
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
  <sequence id="sequence" TL.SQAudioVisibleBase="0" TL.SQVideoVisibleBase="0" TL.SQVisibleBaseTime="0" TL.SQAVDividerPosition="0.5" TL.SQHideShyTracks="0" TL.SQHeaderWidth="292" Monitor.ProgramZoomOut="0" Monitor.ProgramZoomIn="0" TL.SQTimePerPixel="0.19999999999999998" MZ.EditLine="0" MZ.Sequence.PreviewFrameSizeHeight="${video.height}" MZ.Sequence.PreviewFrameSizeWidth="${video.width}" MZ.Sequence.AudioTimeDisplayFormat="200" MZ.Sequence.PreviewRenderingClassID="1061109567" MZ.Sequence.PreviewRenderingPresetCodec="1634755439" MZ.Sequence.PreviewRenderingPresetPath="EncoderPresets/SequencePreview/795454d9-d3c2-429d-9474-923ab13b7018/QuickTime.epr" MZ.Sequence.PreviewUseMaxRenderQuality="false" MZ.Sequence.PreviewUseMaxBitDepth="false" MZ.Sequence.EditingModeGUID="795454d9-d3c2-429d-9474-923ab13b7018" MZ.Sequence.VideoTimeDisplayFormat="101" MZ.WorkOutPoint="${this.WORK_OUT_POINT}" MZ.WorkInPoint="0" explodedTracks="true">
    <uuid>${sequenceUuid}</uuid>
    <duration>${totalFrames}</duration>
    <rate>
      <timebase>${timebase}</timebase>
      <ntsc>${ntsc}</ntsc>
    </rate>
    <name>${this.escapeXml(video.originalFilename)} ${dateStr}</name>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            <rate>
              <timebase>${timebase}</timebase>
              <ntsc>${ntsc}</ntsc>
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
              <timebase>${timebase}</timebase>
              <ntsc>${ntsc}</ntsc>
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
        <timebase>${timebase}</timebase>
        <ntsc>${ntsc}</ntsc>
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

      const ffmpeg = spawn(this.ffmpegPath, args);
      let stderr = '';
      const disarm = armProcessKillTimer(ffmpeg, 120_000);

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('error', (err) => {
        disarm();
        reject(err);
      });

      ffmpeg.on('close', (code) => {
        disarm();
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
   * Export PDF - matches the layout of a real Frame.io "print comments" export:
   * plain white browser-print header/footer, video poster + project name +
   * filename + exporter, "Sorted by timecode" row, then one row per comment
   * with a frame thumbnail on the left and avatar/name/date/#N/timecode-badge
   * on the right.
   */
  async exportPdf(videoId: string, requestingUser: { userId: string; email?: string; username?: string }): Promise<Buffer> {
    const video = await this.videosService.findOne(videoId);
    const { items: comments } = await this.commentsService.findByVideo(videoId);
    const annotations = await this.annotationsService.findByVideo(videoId);
    const project = await this.projectsService.findOne(video.projectId, requestingUser.userId);
    const printUuid = await this.videosService.ensurePrintUuid(videoId);

    const annotationsByComment = new Map<string, Annotation[]>();
    for (const annotation of annotations) {
      const list = annotationsByComment.get(annotation.commentId) || [];
      list.push(annotation);
      annotationsByComment.set(annotation.commentId, list);
    }

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

    const exportedAt = new Date();
    const posterPath = path.join(process.cwd(), 'uploads', 'thumbnails', `${videoId}.jpg`);
    const posterBase64 = fs.existsSync(posterPath)
      ? `data:image/jpeg;base64,${fs.readFileSync(posterPath).toString('base64')}`
      : '';
    const exporterName = requestingUser.username || requestingUser.email || 'Unknown';
    const pageTitle = `${video.originalFilename} - R.Frame`;
    const permalinkUrl = `https://next.frame.io/print/comments/${printUuid}`;

    const commentsHtml = screenshots.map((s, i) => {
      const c = s.comment;
      const timecode = this.formatTimecode(c.timestamp, video.fps);
      const screenshotBase64 = s.screenshotPath && fs.existsSync(s.screenshotPath)
        ? `data:image/jpeg;base64,${fs.readFileSync(s.screenshotPath).toString('base64')}`
        : '';
      const annotationOverlay = this.buildAnnotationOverlaySvg(annotationsByComment.get(c.id) || []);
      const authorName = c.user?.name || 'Unknown';
      const postedAt = `${this.formatShortDate(c.createdAt)} at ${this.formatShortTime(c.createdAt)}`;

      return `
        <div class="comment-row">
          ${screenshotBase64 ? `
          <div class="comment-thumb" style="aspect-ratio:${video.width || 16}/${video.height || 9}">
            <img src="${screenshotBase64}" />${annotationOverlay}
          </div>` : ''}
          <div class="comment-body">
            <div class="comment-row-header">
              <div class="comment-author">
                <span class="avatar">${this.escapeHtml(this.getInitials(authorName))}</span>
                <span class="author-name">${this.escapeHtml(authorName)}</span>
                <span class="posted-at">${this.escapeHtml(postedAt)}</span>
              </div>
              <div class="comment-number">#${c.sequenceNumber ?? i + 1} <span class="globe-icon">&#127760;</span></div>
            </div>
            <div class="comment-text">
              <span class="timecode-badge">${timecode}</span>
              <span>${this.escapeHtml(c.content)}</span>
            </div>
          </div>
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${this.escapeHtml(pageTitle)}</title>
  <style>
    @page { size: A4; margin: 15mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; line-height: 1.5; }

    .video-info { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
    .video-info .thumb { width: 64px; height: 64px; object-fit: cover; border-radius: 4px; background: #000; flex-shrink: 0; }
    .video-meta { flex: 1; min-width: 0; }
    .project-name { font-size: 12px; color: #666; }
    .video-title { font-size: 18px; font-weight: 700; }
    .export-meta { text-align: right; font-size: 12px; color: #666; flex-shrink: 0; }

    .divider { border: none; border-top: 1px solid #e0e0e0; margin: 12px 0; }
    .sort-row { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #2563eb; margin-bottom: 16px; }

    .comment-row {
      display: flex;
      gap: 16px;
      padding: 16px 0;
      border-bottom: 1px solid #eee;
      page-break-inside: avoid;
    }
    .comment-thumb {
      position: relative;
      width: 220px;
      flex-shrink: 0;
      background: #000;
      overflow: hidden;
      border-radius: 4px;
    }
    .comment-thumb img { display: block; width: 100%; height: 100%; object-fit: contain; }
    .annotation-overlay { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }

    .comment-body { flex: 1; min-width: 0; }
    .comment-row-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .comment-author { display: flex; align-items: center; gap: 6px; }
    .avatar {
      width: 20px; height: 20px; border-radius: 50%; background: #3b82f6; color: #fff;
      font-size: 9px; font-weight: 700; display: flex; align-items: center; justify-content: center;
    }
    .author-name { font-weight: 700; font-size: 13px; }
    .posted-at { font-size: 12px; color: #666; }
    .comment-number { font-size: 11px; color: #999; display: flex; align-items: center; gap: 4px; }
    .comment-text { font-size: 13px; color: #1a1a1a; }
    .timecode-badge {
      background: #fde047; padding: 1px 6px; border-radius: 3px; font-family: monospace; font-size: 12px; margin-right: 6px;
    }

    .no-comments { text-align: center; padding: 40px; color: #999; font-style: italic; }
  </style>
</head>
<body>
  <div class="video-info">
    ${posterBase64 ? `<img class="thumb" src="${posterBase64}" />` : ''}
    <div class="video-meta">
      <div class="project-name">${this.escapeHtml(project.name)}</div>
      <div class="video-title">${this.escapeHtml(video.originalFilename)}</div>
    </div>
    <div class="export-meta">
      <div>${this.escapeHtml(exporterName)}, ${this.formatShortDate(exportedAt)}</div>
    </div>
  </div>
  <hr class="divider" />
  <div class="sort-row">&#8801; Sorted by timecode</div>

  ${comments.length === 0 ? '<div class="no-comments">No comments yet</div>' : commentsHtml}
</body>
</html>`;

    // Generate PDF
    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });

      const headerTemplate = `
        <div style="font-size:9px; width:100%; padding:0 15mm; display:flex; justify-content:space-between; color:#5f6368; font-family:sans-serif;">
          <span>${this.escapeHtml(this.formatShortDate(exportedAt))}, ${this.escapeHtml(this.formatShortTime(exportedAt))}</span>
          <span>${this.escapeHtml(pageTitle)}</span>
          <span></span>
        </div>`;
      const footerTemplate = `
        <div style="font-size:9px; width:100%; padding:0 15mm; display:flex; justify-content:space-between; color:#5f6368; font-family:sans-serif;">
          <span>${this.escapeHtml(permalinkUrl)}</span>
          <span><span class="pageNumber"></span>/<span class="totalPages"></span></span>
        </div>`;

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate,
        footerTemplate,
        margin: { top: '20mm', right: '12mm', bottom: '18mm', left: '12mm' },
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

  /**
   * Renders drawn annotations (freehand/highlight strokes, rectangles, text)
   * as an SVG overlay sized to match the screenshot exactly, so coordinates
   * stored as 0-1 fractions of the drawing canvas line up with a 0-1 viewBox
   * regardless of pixel size.
   * ponytail: annotation points are recorded against the on-screen video pane,
   * which can letterbox relative to the video's native aspect ratio — this
   * overlay assumes no letterbox offset. Revisit once the annotation-recording
   * pipeline tracks the actual video content box instead of the full pane.
   */
  private buildAnnotationOverlaySvg(annotations: Annotation[]): string {
    if (annotations.length === 0) {
      return '';
    }

    const shapes = annotations
      .map((annotation) => {
        const data = annotation.data as {
          color?: string;
          points?: Array<{ x: number; y: number }>;
          x?: number;
          y?: number;
          width?: number;
          height?: number;
          text?: string;
        };
        const color = data?.color && /^#[0-9a-fA-F]{6}$/.test(data.color) ? data.color : '#ff0000';

        if (annotation.type === 'rectangle' && [data?.x, data?.y, data?.width, data?.height].every((v) => typeof v === 'number')) {
          return `<rect x="${data.x}" y="${data.y}" width="${data.width}" height="${data.height}" fill="none" stroke="${color}" stroke-width="3" vector-effect="non-scaling-stroke" />`;
        }

        if (annotation.type === 'text' && typeof data?.text === 'string' && data.text.trim() && typeof data?.x === 'number' && typeof data?.y === 'number') {
          return `<text x="${data.x}" y="${data.y}" fill="${color}" font-size="0.035" font-family="sans-serif">${this.escapeHtml(data.text)}</text>`;
        }

        // Annotation data is user-submitted free-form JSON — only finite
        // numbers may reach the SVG markup, or a crafted point value could
        // break out of the attribute and inject HTML into the headless render.
        const points = (Array.isArray(data?.points) ? data.points : [])
          .filter(
            (p: any) =>
              p &&
              typeof p.x === 'number' &&
              typeof p.y === 'number' &&
              Number.isFinite(p.x) &&
              Number.isFinite(p.y),
          )
          .map((p: { x: number; y: number }) => p as { x: number; y: number });
        if (points.length < 2) {
          return '';
        }
        const isHighlight = annotation.type === 'highlight';
        const strokeWidth = isHighlight ? 14 : 3;
        const opacity = isHighlight ? 0.35 : 1;
        const pointsAttr = points.map((p) => `${p.x},${p.y}`).join(' ');
        return `<polyline points="${pointsAttr}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" vector-effect="non-scaling-stroke" />`;
      })
      .join('');

    if (!shapes) {
      return '';
    }

    return `<svg class="annotation-overlay" viewBox="0 0 1 1" preserveAspectRatio="none">${shapes}</svg>`;
  }

  /** "YYYY-M-D HH-MM-SS" in Vietnam time — month/day unpadded, time padded, matching the reference export exactly. */
  private formatXmlDateStr(date: Date): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: this.VN_TIMEZONE,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value || '0';
    const pad = (v: string) => (v === '24' ? '00' : v.padStart(2, '0'));
    return `${get('year')}-${get('month')}-${get('day')} ${pad(get('hour'))}-${pad(get('minute'))}-${pad(get('second'))}`;
  }

  /** "M/D/YY" in Vietnam time, matching the reference PDF's date format. */
  private formatShortDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: this.VN_TIMEZONE,
      year: '2-digit',
      month: 'numeric',
      day: 'numeric',
    }).format(date);
  }

  /** "H:MM AM/PM" in Vietnam time, matching the reference PDF's time format. */
  private formatShortTime(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: this.VN_TIMEZONE,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  }

  private getInitials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?';
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
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

  private formatTimecode(seconds: number, fps: number): string {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * fps);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  }
}