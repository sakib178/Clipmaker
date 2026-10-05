#!/usr/bin/env node
// Controlled downloader for adapter tests. This never accesses YouTube.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
const section = option('--download-sections');
const range = /^\*(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(section || '');
if (!range || !option('--js-runtimes')?.startsWith('node:')) throw new Error('Missing timestamp section or Node challenge runtime.');
const duration = Number(range[2]) - Number(range[1]);
if (process.env.CLIP_STUDIO_TEST_DLP_LOG) fs.appendFileSync(process.env.CLIP_STUDIO_TEST_DLP_LOG, JSON.stringify(args) + '\n');
const video = args.includes('--merge-output-format');
const output = option('-o').replace('%(ext)s', video ? 'mp4' : 'wav');
const input = video ? ['-f', 'lavfi', '-i', `testsrc2=size=160x90:rate=24:duration=${duration}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p'] : ['-f', 'lavfi', '-i', `sine=frequency=550:sample_rate=44100:duration=${duration}`, '-c:a', 'pcm_s16le'];
execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-v', 'error', ...input, output]);
