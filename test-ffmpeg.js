import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

console.log('ffmpeg path:', ffmpegStatic);
ffmpeg.setFfmpegPath(ffmpegStatic);

const inputPath = 'package.json'; // Just something to cause an error quickly
ffmpeg(inputPath)
  .outputOptions(['-c:v libx264', '-preset fast', '-crf 23', '-c:a aac', '-b:a 128k', '-movflags +faststart'])
  .save('output.mp4')
  .on('end', () => console.log('End'))
  .on('error', (err) => console.log('Error:', err.message));
