/**
 * VttMergeService - 複数VTTファイルのパース・話者分離マージ
 *
 * 各参加者のVTTをfetchし、Voice tag (<v SpeakerName>) で
 * 話者分離してタイムスタンプ順にマージする。
 */

export interface VttSegment {
  startTime: number;
  endTime: number;
  startTimeStr: string;
  endTimeStr: string;
  text: string;
  speakerName: string;
}

function parseVttTimestamp(ts: string): number {
  const parts = ts.trim().split(':');
  if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  } else if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return 0;
}

export function parseVtt(vttText: string): Omit<VttSegment, 'speakerName'>[] {
  const lines = vttText.split('\n');
  const segments: Omit<VttSegment, 'speakerName'>[] = [];
  let i = 0;

  // Skip WEBVTT header and metadata
  while (i < lines.length && !lines[i].includes('-->')) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.includes('-->')) {
      const [startStr, endStr] = line.split('-->').map(s => s.trim());
      const startTime = parseVttTimestamp(startStr);
      const endTime = parseVttTimestamp(endStr);

      const textLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '') {
        textLines.push(lines[i].trim());
        i++;
      }

      if (textLines.length > 0) {
        segments.push({ startTimeStr: startStr, endTimeStr: endStr, startTime, endTime, text: textLines.join('\n') });
      }
    } else {
      i++;
    }
  }

  return segments;
}

export function generateMergedVtt(segments: VttSegment[]): string {
  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);

  let vtt = 'WEBVTT\n\n';
  sorted.forEach((seg, index) => {
    vtt += `${index + 1}\n`;
    vtt += `${seg.startTimeStr} --> ${seg.endTimeStr}\n`;
    vtt += `<v ${seg.speakerName}>${seg.text}\n\n`;
  });

  return vtt;
}

export async function fetchAndMergeVtts(
  entries: { recordingId: string; url: string }[],
  getSpeakerName: (recordingId: string) => string | undefined,
): Promise<string | null> {
  const allSegments: VttSegment[] = [];

  const results = await Promise.allSettled(
    entries.map(async ({ recordingId, url }) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      return { recordingId, text };
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { recordingId, text } = result.value;
      const speakerName = getSpeakerName(recordingId) || `Speaker-${recordingId.substring(0, 4)}`;
      const segments = parseVtt(text);
      for (const seg of segments) {
        allSegments.push({ ...seg, speakerName });
      }
    }
  }

  if (allSegments.length === 0) return null;
  return generateMergedVtt(allSegments);
}
