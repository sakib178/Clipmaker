import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseTimeToSeconds, formatSrtTime, parseSubtitleContent, generateSrtContent, generateVttContent, trimSubtitleCues } from '../src/utils/time.ts';
import { extractClientYoutubeId } from '../src/utils/api.ts';
import { AudioEngine } from '../src/utils/audioEngine.ts';

const exec = promisify(execFile);
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'clip-studio-tests-'));
process.env.CLIP_STUDIO_CACHE_DIR = path.join(root, 'cache');
process.env.CLIP_STUDIO_DATA_DIR = path.join(root, 'data');
process.env.GEMINI_API_KEY = '';
process.env.CANVA_CLIENT_ID = '';
process.env.CANVA_CLIENT_SECRET = '';
process.env.CANVA_ACCESS_TOKEN = '';
process.env.NODE_ENV = 'production';
process.env.PORT = '0';
const { app } = await import('../server.ts');
const { extractYoutubeVideoId, extractYoutubeOriginalAudio, probeMedia } = await import('../server/media.ts');
let server: any, base = '', webhookServer: any;
let wav: Buffer, video: Buffer, exportId = '';
const post = (url: string, body: any) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const raw = (url: string, body: Buffer) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: new Uint8Array(body) });
const fixtureId = 'TestAudio01';
const legacy = path.join(os.tmpdir(), `yt-full-${fixtureId}.mp3`);

before(async () => {
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
  await exec('ffmpeg', ['-y','-v','error','-f','lavfi','-i','testsrc2=size=320x180:rate=30:duration=1','-an','-c:v','libvpx-vp9',path.join(root,'video.webm')]);
  await exec('ffmpeg', ['-y','-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=44100:duration=4','-f','lavfi','-i','sine=frequency=880:sample_rate=44100:duration=4','-filter_complex','[0:a][1:a]amerge=inputs=2','-c:a','pcm_s16le',path.join(root,'stereo.wav')]);
  await exec('ffmpeg', ['-y','-v','error','-i',path.join(root,'stereo.wav'),'-c:a','libmp3lame',legacy]);
  wav = await fs.readFile(path.join(root,'stereo.wav')); video = await fs.readFile(path.join(root,'video.webm'));
});
after(async () => { await new Promise<void>(r => server.close(r)); if (webhookServer) await new Promise<void>(r => webhookServer.close(r)); await fs.unlink(legacy).catch(()=>{}); await fs.rm(root,{recursive:true,force:true}); });

async function convert(audio = wav, query = '') {
  const prep = await raw('/api/export-audio-temp', audio); assert.equal(prep.status, 200, await prep.clone().text());
  const { audioToken } = await prep.json();
  const response = await raw(`/api/convert-mp4?audioToken=${audioToken}&ytDuration=2&fps=24&width=640&height=360${query}`, video);
  assert.equal(response.status,200, await response.clone().text().catch(()=>''));
  const id = response.headers.get('X-Clip-Export-Id')!;
  const file = path.join(root,`${id}.mp4`); await fs.writeFile(file,Buffer.from(await response.arrayBuffer()));
  return { file, id };
}
async function pcm(file: string) {
  const output = await exec('ffmpeg', ['-v','error','-i',file,'-vn','-c:a','pcm_f32le','-f','f32le','pipe:1'], {encoding:'buffer',maxBuffer:10*1024*1024});
  const data = output.stdout as Buffer; let sum=0,peak=0;
  for(let i=0;i<data.length;i+=4) {const v=data.readFloatLE(i);sum+=v*v;peak=Math.max(peak,Math.abs(v));}
  return {rms:Math.sqrt(sum/(data.length/4)),peak};
}

test('YouTube parsers accept video, Shorts, live and reordered query URLs; reject lookalike hosts', () => {
  for(const link of ['https://youtu.be/abcdefghijk?t=12','https://youtube.com/watch?feature=share&v=abcdefghijk','https://m.youtube.com/shorts/abcdefghijk','https://youtube.com/live/abcdefghijk','abcdefghijk']) {
    assert.equal(extractYoutubeVideoId(link),'abcdefghijk');assert.equal(extractClientYoutubeId(link),'abcdefghijk');
  }
  for(const link of ['https://evil.test/youtube.com/watch?v=abcdefghijk','https://youtube.com.evil.test/watch?v=abcdefghijk','https://youtu.be/short']) {assert.equal(extractYoutubeVideoId(link),null);assert.equal(extractClientYoutubeId(link),null);}
});
test('timestamp parsing rejects malformed values and millisecond formatting carries correctly', () => {
  assert.equal(parseTimeToSeconds('01:02:03.125'),3723.125); assert.equal(parseTimeToSeconds('90.5'),90.5);
  for(const value of ['bad','1:99','-4','Infinity','1:2junk']) assert.ok(Number.isNaN(parseTimeToSeconds(value)));
  assert.equal(formatSrtTime(59.9996),'00:01:00,000');
});
test('SRT/VTT round trips retain numeric captions, multiline text and cue settings', () => {
  const cues=parseSubtitleContent('WEBVTT\n\ncueA\n00:00:01.000 --> 00:00:03.000 align:start\n123\nHello\n\nNOTE ignored\nmetadata\n');
  assert.equal(cues.length,1); assert.equal(cues[0].text,'123\nHello'); assert.equal(cues[0].end,3);
  assert.equal(parseSubtitleContent(generateSrtContent(cues))[0].text,'123\nHello');
  assert.equal(parseSubtitleContent(generateVttContent(cues))[0].end,3);
});
test('missing audio fails instead of exporting silent AAC', async () => {
  const response=await raw('/api/convert-mp4?ytDuration=2',video); assert.equal(response.status,422);assert.match((await response.json()).error,/No original audio/);
  const expired=await raw('/api/convert-mp4?audioToken=missing&ytDuration=2',video);assert.equal(expired.status,422);
});
test('invalid WAV upload and invalid media reject clearly',async()=>{
  const bad=await raw('/api/export-audio-temp',Buffer.from('not a wav'));assert.equal(bad.status,400);
  const videoError=await raw('/api/convert-mp4',Buffer.from('not a video'));assert.equal(videoError.status,500);assert.ok((await videoError.json()).error);
});
test('MP4 export has audible stereo AAC, H.264, requested duration, dimensions and FPS',async()=>{
  const result=await convert();exportId=result.id;
  const info=await probeMedia(result.file);const audio=info.streams.find(s=>s.codec_type==='audio'),v=info.streams.find(s=>s.codec_type==='video');
  assert.equal(audio.codec_name,'aac');assert.equal(audio.channels,2);assert.equal(v.codec_name,'h264');assert.equal(v.width,640);assert.equal(v.height,360);assert.equal(v.avg_frame_rate,'24/1');assert.ok(Math.abs(info.duration-2)<0.12);
  const levels=await pcm(result.file);assert.ok(levels.rms>0.04,JSON.stringify(levels));
  const saved=await fetch(`${base}/api/exports/${result.id}.mp4`);assert.equal(saved.status,200);assert.equal((await saved.arrayBuffer()).byteLength,(await fs.stat(result.file)).size);
});
test('pre-trimmed client audio is preferred; it is not re-fetched from YouTube or amplified twice',async()=>{
  const result=await convert(wav,'&videoId=abcdefghijk&ytStart=99&volume=0');
  assert.ok((await pcm(result.file)).rms>0.04);
});
test('60 FPS and 4K dimensions are honored by the MP4 encoder',async()=>{
  const prepared=await raw('/api/export-audio-temp',wav);const {audioToken}=await prepared.json();
  const response=await raw(`/api/convert-mp4?audioToken=${audioToken}&ytDuration=0.15&fps=60&width=2160&height=3840`,video);
  assert.equal(response.status,200,await response.clone().text().catch(()=>''));
  const file=path.join(root,'4k.mp4');await fs.writeFile(file,Buffer.from(await response.arrayBuffer()));
  const info=await probeMedia(file);const v=info.streams.find(s=>s.codec_type==='video');assert.equal(v.width,2160);assert.equal(v.height,3840);assert.equal(v.avg_frame_rate,'60/1');
});
test('different fractional timestamp ranges never reuse the wrong cache; concurrent pulls share a job',async()=>{
  const [first,shared]=await Promise.all([extractYoutubeOriginalAudio(fixtureId,0.2,2.2),extractYoutubeOriginalAudio(fixtureId,0.2,2.2)]);
  const second=await extractYoutubeOriginalAudio(fixtureId,0.8,2.8);
  assert.ok(first && second);assert.equal(first.slicedMp3Path,shared?.slicedMp3Path);assert.notEqual(first.slicedMp3Path,second.slicedMp3Path);assert.ok(Math.abs(first.duration-2)<0.08);
  const response=await post('/api/youtube/audio',{videoId:fixtureId,startTime:1.2,endTime:2.7});assert.equal(response.status,200);const data=await response.json();assert.ok(data.audioBase64);assert.ok(Math.abs(data.duration-1.5)<0.08);
});
test('invalid timestamp ranges reject instead of quietly changing the requested clip',async()=>{
  const response=await post('/api/youtube/audio',{videoId:fixtureId,startTime:4,endTime:2});assert.equal(response.status,400);
});
test('downloader adapter supplies exact sections and serves validated audio and real video', { skip: process.platform === 'win32' }, async () => {
  const oldDownloader = process.env.YT_DLP_PATH;
  const downloader = path.resolve('tests/fixtures/fake-yt-dlp.mjs');
  const log = path.join(root, 'downloader.jsonl');
  await fs.chmod(downloader, 0o755);
  process.env.YT_DLP_PATH = downloader;
  process.env.CLIP_STUDIO_TEST_DLP_LOG = log;
  try {
    const audio = await extractYoutubeOriginalAudio('DlpTest0001', 3.25, 4.75);
    assert.ok(audio); assert.ok(Math.abs(audio.duration - 1.5) < 0.08);
    assert.ok((await pcm(audio.slicedMp3Path)).rms > 0.04);
    const response = await fetch(`${base}/api/youtube/video?videoId=DlpTest0001&startTime=3.25&endTime=4.75`);
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type')!, /video\/mp4/);
    const file = path.join(root, 'youtube-background.mp4');
    await fs.writeFile(file, Buffer.from(await response.arrayBuffer()));
    const info = await probeMedia(file);
    assert.ok(info.streams.some(stream => stream.codec_type === 'video'));
    assert.ok(Math.abs(info.duration - 1.5) < 0.1);
    const calls = (await fs.readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.equal(calls.length, 2);
    for (const args of calls) assert.equal(args[args.indexOf('--download-sections') + 1], '*3.25-4.75');
    assert.equal((await fetch(`${base}/api/youtube/video?videoId=DlpTest0001&startTime=3.25&endTime=4.75`)).status, 200);
    assert.equal((await fs.readFile(log, 'utf8')).trim().split('\n').length, 2);
  } finally {
    if (oldDownloader === undefined) delete process.env.YT_DLP_PATH; else process.env.YT_DLP_PATH = oldDownloader;
    delete process.env.CLIP_STUDIO_TEST_DLP_LOG;
  }
});
test('unconfigured AI returns errors without inventing transcription or translation',async()=>{
  for(const url of ['/api/transcribe','/api/translate']) {
    const response=await post(url,{subtitles:[{id:'1',start:0,end:1,text:'Keep me'}],targetLanguage:'ar'});assert.equal(response.status,503);assert.equal((await response.json()).subtitles,undefined);
  }
});
test('Canva cannot be connected by an empty token or a forged OAuth callback',async()=>{
  const empty=await post('/api/canva/connect',{});assert.equal(empty.status,400);
  const forged=await fetch(base+'/auth/callback?completed=1&provider=canva&code=fake');assert.equal(forged.status,400);
  const oauth=await fetch(base+'/api/oauth/url?provider=canva');assert.equal(oauth.status,503);
  const state=await (await fetch(base+'/api/integrations')).json();assert.equal(state.canva.connected,false);assert.equal(state.canva.accessToken,undefined);
});
test('n8n requires a real workflow and current exported clip; failed webhooks never report publication',async()=>{
  const blank=await post('/api/n8n/publish',{});assert.equal(blank.status,502);assert.equal((await blank.json()).success,false);
  const mapping=await post('/api/accounts/connect',{id:'youtube_shorts',handle:'@test',authMethod:'n8n_credential',credentialName:'existing-test-credential'});assert.equal(mapping.status,200);
  let payload:any;
  const {createServer}=await import('node:http');
  webhookServer=createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{payload=JSON.parse(body);res.statusCode=req.url==='/fail'?500:200;res.end('workflow response');});});
  webhookServer.listen(0,'127.0.0.1');await once(webhookServer,'listening');const hook=`http://127.0.0.1:${webhookServer.address().port}`;
  const body={webhookUrl:hook+'/ok',accounts:[{id:'youtube_shorts',enabledForPost:true}],caption:'test',clipMetadata:{exportId}};
  const missing=await post('/api/n8n/publish',{...body,clipMetadata:{}});assert.equal(missing.status,409);
  const fail=await post('/api/n8n/publish',{...body,webhookUrl:hook+'/fail'});assert.equal(fail.status,502);assert.equal((await fail.json()).success,false);
  const success=await post('/api/n8n/publish',body);assert.equal(success.status,200);const data=await success.json();assert.equal(data.results[0].status,'accepted_by_n8n');assert.match(payload.clip.videoMp4Url,new RegExp(exportId));
  const oldSchedule=await post('/api/n8n/publish',{...body,scheduleMode:'scheduled',scheduledTime:'2020-01-01'});assert.equal(oldSchedule.status,400);
});

class BufferMock {
  length:number; duration:number; private data:Float32Array[];
  constructor(public numberOfChannels:number,length:number,public sampleRate:number){this.length=length;this.duration=length/sampleRate;this.data=Array.from({length:numberOfChannels},()=>new Float32Array(length));}
  getChannelData(channel:number){return this.data[channel];}
}
class ContextMock {
  state='running';sampleRate=48000;currentTime=0;decoded:BufferMock;
  constructor(){this.decoded=new BufferMock(2,48000*3,48000);this.decoded.getChannelData(1).fill(0.5);}
  async decodeAudioData(){return this.decoded;}
  createBuffer(ch:number,len:number,rate:number){return new BufferMock(ch,len,rate);}
  createBufferSource(){return {buffer:null,playbackRate:{value:1,setValueAtTime(){}},connect(){},disconnect(){},start(){},stop(){},onended:null};}
  createGain(){return {gain:{value:1,setValueAtTime(){}},connect(){},disconnect(){}};}
  createAnalyser(){return {fftSize:128,frequencyBinCount:64,connect(){},disconnect(){},getByteFrequencyData(){}};}
}
test('Web Audio WAV slicing preserves stereo, gains once, and never wraps an invalid trim to time zero',async()=>{
  (globalThis as any).window={AudioContext:ContextMock};const engine=new AudioEngine();await engine.loadAudioFromBase64('AAAA');
  const blob=engine.exportHighQualityWavBlob(1,2,0.5)!;const buffer=Buffer.from(await blob.arrayBuffer());assert.equal(buffer.readUInt16LE(22),2);assert.equal(buffer.readUInt32LE(24),48000);assert.equal(buffer.length,44+48000*4);assert.ok(Math.abs(buffer.readInt16LE(46)/32767-0.25)<0.001);
  assert.equal(engine.exportHighQualityWavBlob(3,4),null);assert.equal(engine.exportHighQualityWavBlob(2,1),null);
  const mono=Buffer.from(engine.exportWavBase64(0,1)!,'base64');assert.equal(mono.readUInt16LE(22),1);assert.ok(mono.readInt16LE(44)>8000);
});
test('same YouTube video at a different timeframe fetches a new audio buffer; uploaded audio cancels stale loads',async()=>{
  (globalThis as any).window={AudioContext:ContextMock};const engine=new AudioEngine();await engine.loadYoutubeAudioBuffer('AAAA','abcdefghijk',0,3);
  const original=globalThis.fetch;let calls=0;globalThis.fetch=(async()=>{calls++;return new Response(JSON.stringify({audioBase64:'AAAA'}),{headers:{'content-type':'application/json'}});}) as any;
  try {await engine.ensureRealYoutubeBuffer('abcdefghijk',0,3);assert.equal(calls,0);await engine.ensureRealYoutubeBuffer('abcdefghijk',1,4);assert.equal(calls,1);}finally{globalThis.fetch=original;}
  let resolve:any;const pending=new Promise<ArrayBuffer>(r=>resolve=r);const old=engine.loadAudioFromFile({arrayBuffer:()=>pending} as File);await engine.loadAudioFromBase64('AAAA');resolve(new ArrayBuffer(2));await assert.rejects(old,/Another audio source/);
});

test('subtitle downloads are clipped and shifted to the same timeline as the trimmed MP4', () => {
  const cues=trimSubtitleCues([{id:'1',start:0.5,end:2,text:'First'}, {id:'2',start:2,end:4,text:'Second'}, {id:'3',start:4,end:6,text:'Outside'}],1,3);
  assert.deepEqual(cues.map(c=>[c.start,c.end]),[[0,1],[1,2]]);
  assert.match(generateSrtContent(cues),/00:00:00,000 --> 00:00:01,000/);
});
