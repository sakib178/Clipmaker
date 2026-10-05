import React, { useState } from 'react';
import { ClipTitleConfig, SubtitleStyle } from '../types';
import { AVAILABLE_FONTS, SUBTITLE_PRESETS } from '../constants/presets';
import {
  Type,
  Palette,
  Sparkles,
  MoveVertical,
  Heading,
  Sliders,
  Eye,
  EyeOff,
  Maximize2,
  AlignCenter,
} from 'lucide-react';

interface StylePanelProps {
  style: SubtitleStyle;
  onStyleChange: (style: SubtitleStyle) => void;
  clipTitle: ClipTitleConfig;
  onClipTitleChange: (title: ClipTitleConfig) => void;
}

export const StylePanel: React.FC<StylePanelProps> = ({
  style,
  onStyleChange,
  clipTitle,
  onClipTitleChange,
}) => {
  const [activeTab, setActiveTab] = useState<'subtitles' | 'title'>('subtitles');
  const [fontFilter, setFontFilter] = useState<'all' | 'ar' | 'en'>('all');

  const updateStyle = (key: keyof SubtitleStyle, value: any) => {
    onStyleChange({ ...style, [key]: value });
  };

  const updateTitle = (key: keyof ClipTitleConfig, value: any) => {
    onClipTitleChange({ ...clipTitle, [key]: value });
  };

  const applyPreset = (presetStyle: Partial<SubtitleStyle>) => {
    onStyleChange({ ...style, ...presetStyle });
  };

  const filteredFonts = AVAILABLE_FONTS.filter((f) => {
    if (fontFilter === 'all') return true;
    if (fontFilter === 'ar') return f.language === 'ar';
    return f.language === 'en' || f.language === 'all';
  });

  const fontSizes = [10, 12, 14, 16, 18, 22, 28, 34, 44, 56];

  return (
    <div className="flex flex-col gap-4 p-4 border rounded-2xl bg-zinc-900 border-zinc-800 shadow-xl lg:overflow-y-auto lg:max-h-[640px]">
      {/* Tab Switcher: Subtitles vs Title */}
      <div className="flex p-1 bg-zinc-950 border border-zinc-800 rounded-xl">
        <button
          onClick={() => setActiveTab('subtitles')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'subtitles'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Type className="w-3.5 h-3.5" />
          <span>Subtitles &amp; Captions</span>
        </button>
        <button
          onClick={() => setActiveTab('title')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'title'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Heading className="w-3.5 h-3.5" />
          <span>Clip Title (Persistent)</span>
          {clipTitle.enabled && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </button>
      </div>

      {/* ===================== SUBTITLES TAB ===================== */}
      {activeTab === 'subtitles' && (
        <div className="space-y-4">
          {/* Subtitles Visibility Toggle */}
          <div className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-800 bg-zinc-950/60">
            <div className="flex items-center gap-2">
              {style.showSubtitles !== false ? (
                <Eye className="w-4 h-4 text-emerald-400" />
              ) : (
                <EyeOff className="w-4 h-4 text-zinc-500" />
              )}
              <span className="text-xs font-semibold text-zinc-200">
                Display Synchronized Subtitles
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={style.showSubtitles !== false}
                onChange={(e) => updateStyle('showSubtitles', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          {/* Style Presets Gallery */}
          <div>
            <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-zinc-300">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Preset Subtitle Styles</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SUBTITLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset.style)}
                  className="p-2.5 text-left border rounded-xl bg-zinc-950/60 border-zinc-800 hover:border-indigo-500/60 hover:bg-zinc-800/60 transition-all group"
                >
                  <div className="text-xs font-bold text-white group-hover:text-indigo-300">
                    {preset.name}
                  </div>
                  <div className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">
                    {preset.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Typography Section */}
          <div className="pt-3 border-t border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-300">
                <Type className="w-3.5 h-3.5 text-indigo-400" />
                <span>Font Selection ({filteredFonts.length})</span>
              </div>
              {/* Language filter */}
              <div className="flex gap-1 p-0.5 bg-zinc-950 rounded-lg border border-zinc-800 text-[10px]">
                <button
                  onClick={() => setFontFilter('all')}
                  className={`px-2 py-0.5 rounded ${
                    fontFilter === 'all' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFontFilter('ar')}
                  className={`px-2 py-0.5 rounded ${
                    fontFilter === 'ar' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  عربي ({AVAILABLE_FONTS.filter((f) => f.language === 'ar').length})
                </button>
                <button
                  onClick={() => setFontFilter('en')}
                  className={`px-2 py-0.5 rounded ${
                    fontFilter === 'en' ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  English
                </button>
              </div>
            </div>

            {/* Font List */}
            <div className="grid grid-cols-1 gap-1.5 mb-3 max-h-48 overflow-y-auto pr-1">
              {filteredFonts.map((font) => {
                const isSelected = style.fontFamily === font.family;
                return (
                  <button
                    key={font.id}
                    onClick={() => updateStyle('fontFamily', font.family)}
                    className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500 text-white'
                        : 'bg-zinc-950/40 border-zinc-800/80 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold">{font.name}</div>
                      <div className="text-[10px] text-zinc-500">{font.tag}</div>
                    </div>
                    <div
                      style={{ fontFamily: font.family }}
                      className="text-sm font-bold text-zinc-200"
                    >
                      {font.previewText}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Font Size (Allows smaller than 18px down to 8px, up to 96px) */}
            <div className="p-3 border rounded-xl bg-zinc-950/60 border-zinc-800 space-y-2 mb-3">
              <div className="flex justify-between items-center text-xs text-zinc-400">
                <span className="font-semibold text-zinc-200">Text Size (px)</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="8"
                    max="96"
                    value={style.fontSize}
                    onChange={(e) => updateStyle('fontSize', Math.max(8, Math.min(96, parseInt(e.target.value) || 12)))}
                    className="w-14 px-1.5 py-0.5 text-center font-mono text-xs text-white bg-zinc-900 border border-zinc-700 rounded"
                  />
                  <span className="text-[11px] text-zinc-400">px</span>
                </div>
              </div>
              <input
                type="range"
                min="8"
                max="96"
                value={style.fontSize}
                onChange={(e) => updateStyle('fontSize', parseInt(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              {/* Quick Font Size Buttons */}
              <div className="flex flex-wrap gap-1 pt-1">
                {fontSizes.map((sz) => (
                  <button
                    key={sz}
                    onClick={() => updateStyle('fontSize', sz)}
                    className={`px-1.5 py-0.5 text-[10px] font-mono rounded border transition-colors ${
                      style.fontSize === sz
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-zinc-800/80 text-zinc-400 border-zinc-700 hover:text-white'
                    }`}
                  >
                    {sz}px
                  </button>
                ))}
              </div>
            </div>

            {/* Text Box Width / Spread on Canvas */}
            <div className="p-3 border rounded-xl bg-zinc-950/60 border-zinc-800 space-y-2 mb-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                  <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
                  Text Box Width / Spread
                </span>
                <span className="font-mono text-white text-xs">{style.boxWidth || 85}%</span>
              </div>
              <p className="text-[10px] text-zinc-400">
                Stretches the text boundary so words spread horizontally across the screen or wrap compactly.
              </p>
              <input
                type="range"
                min="25"
                max="100"
                value={style.boxWidth || 85}
                onChange={(e) => updateStyle('boxWidth', parseInt(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-zinc-500">
                <span>Compact (25%)</span>
                <span>Balanced (60%)</span>
                <span>Wide Spread (100%)</span>
              </div>
            </div>

            {/* Letter Spacing */}
            <div className="p-3 border rounded-xl bg-zinc-950/60 border-zinc-800 space-y-2">
              <div className="flex justify-between text-xs text-zinc-400">
                <span className="font-semibold text-zinc-200">Letter Spacing / Tracking</span>
                <span className="font-mono text-white">{style.letterSpacing}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                value={style.letterSpacing}
                onChange={(e) => updateStyle('letterSpacing', parseInt(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            {/* Text Case & Direction */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <span className="block mb-1 text-xs text-zinc-400">Text Case</span>
                <div className="grid grid-cols-3 gap-1">
                  {(['uppercase', 'capitalize', 'none'] as const).map((tCase) => (
                    <button
                      key={tCase}
                      onClick={() => updateStyle('textCase', tCase)}
                      className={`py-1 text-[11px] font-medium rounded border transition-colors ${
                        style.textCase === tCase
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                      }`}
                    >
                      {tCase === 'uppercase' ? 'ABC' : tCase === 'capitalize' ? 'Abc' : 'abc'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block mb-1 text-xs text-zinc-400">Direction</span>
                <div className="grid grid-cols-3 gap-1">
                  {(['auto', 'ltr', 'rtl'] as const).map((dir) => (
                    <button
                      key={dir}
                      onClick={() => updateStyle('direction', dir)}
                      className={`py-1 text-[11px] font-medium rounded border transition-colors ${
                        style.direction === dir
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                      }`}
                    >
                      {dir.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Colors & Highlight Section */}
          <div className="pt-3 border-t border-zinc-800">
            <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-zinc-300">
              <Palette className="w-3.5 h-3.5 text-indigo-400" />
              <span>Colors &amp; Karaoke Highlight</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-2 border rounded-xl bg-zinc-950/60 border-zinc-800">
                <span className="block text-[11px] font-semibold text-zinc-300 mb-1">
                  Active Highlight
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={style.highlightColor}
                    onChange={(e) => updateStyle('highlightColor', e.target.value)}
                    className="w-8 h-8 rounded border-none cursor-pointer bg-transparent"
                  />
                  <span className="font-mono text-xs text-zinc-200">{style.highlightColor}</span>
                </div>
              </div>

              <div className="p-2 border rounded-xl bg-zinc-950/60 border-zinc-800">
                <span className="block text-[11px] font-semibold text-zinc-300 mb-1">
                  Base Text Color
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={style.textColor}
                    onChange={(e) => updateStyle('textColor', e.target.value)}
                    className="w-8 h-8 rounded border-none cursor-pointer bg-transparent"
                  />
                  <span className="font-mono text-xs text-zinc-200">{style.textColor}</span>
                </div>
              </div>
            </div>

            {/* Stroke / Outline */}
            <div className="p-3 border rounded-xl bg-zinc-950/60 border-zinc-800 space-y-2 mt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-200">Text Stroke / Outline</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-white">{style.strokeWidth}px</span>
                  <input
                    type="color"
                    value={style.strokeColor}
                    onChange={(e) => updateStyle('strokeColor', e.target.value)}
                    disabled={style.strokeWidth === 0}
                    className={`w-6 h-6 rounded border-none bg-transparent ${
                      style.strokeWidth === 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                    }`}
                  />
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="12"
                value={style.strokeWidth}
                onChange={(e) => updateStyle('strokeWidth', parseInt(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <div className="flex flex-wrap gap-1 pt-1">
                {[
                  { label: '0px (Off)', val: 0 },
                  { label: '2px', val: 2 },
                  { label: '4px', val: 4 },
                  { label: '6px', val: 6 },
                  { label: '8px', val: 8 },
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => updateStyle('strokeWidth', item.val)}
                    className={`px-2 py-0.5 text-[10px] font-mono rounded border transition-colors cursor-pointer ${
                      style.strokeWidth === item.val
                        ? 'bg-indigo-600 text-white border-indigo-500 font-bold'
                        : 'bg-zinc-800/80 text-zinc-400 border-zinc-700 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Drop Shadow & Karaoke Bounce Animation Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
              <label className="flex items-center justify-between p-2.5 border rounded-xl bg-zinc-950/60 border-zinc-800 text-xs cursor-pointer">
                <span className="text-zinc-200 font-medium">Text Drop Shadow</span>
                <input
                  type="checkbox"
                  checked={Boolean(style.shadow)}
                  onChange={(e) => updateStyle('shadow', e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 border rounded-xl bg-zinc-950/60 border-zinc-800 text-xs cursor-pointer">
                <span className="text-zinc-200 font-medium">Word Pop Animation</span>
                <input
                  type="checkbox"
                  checked={style.animation === 'karaoke-bounce'}
                  onChange={(e) =>
                    updateStyle('animation', e.target.checked ? 'karaoke-bounce' : 'static')
                  }
                  className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                />
              </label>
            </div>
          </div>

          {/* Position & Box Background */}
          <div className="pt-3 border-t border-zinc-800">
            <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-zinc-300">
              <MoveVertical className="w-3.5 h-3.5 text-indigo-400" />
              <span>Vertical Position &amp; Background Pill</span>
            </div>

            <div className="mb-3">
              <div className="flex items-center justify-between mb-1 text-xs text-zinc-400">
                <span>Vertical Position (Y)</span>
                <span className="font-mono text-white">{style.positionY}%</span>
              </div>
              <div className="flex gap-2 mb-2">
                {[
                  { label: 'Top', val: 20 },
                  { label: 'Center', val: 50 },
                  { label: 'Bottom', val: 78 },
                ].map((pos) => (
                  <button
                    key={pos.label}
                    onClick={() => updateStyle('positionY', pos.val)}
                    className={`flex-1 py-1 text-xs font-medium rounded border ${
                      style.positionY === pos.val
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>
              <input
                type="range"
                min="10"
                max="90"
                value={style.positionY}
                onChange={(e) => updateStyle('positionY', parseInt(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            {/* Box Background Toggle */}
            <div className="p-3 border rounded-xl bg-zinc-950/60 border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-200">Dark Box Background Pill</span>
                <input
                  type="checkbox"
                  checked={style.boxBackground}
                  onChange={(e) => updateStyle('boxBackground', e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                />
              </div>
              {style.boxBackground && (
                <div className="pt-2 flex items-center justify-between gap-3 border-t border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-zinc-400">Color:</span>
                    <input
                      type="color"
                      value={style.boxColor}
                      onChange={(e) => updateStyle('boxColor', e.target.value)}
                      className="w-6 h-6 rounded border-none cursor-pointer bg-transparent"
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-[11px] text-zinc-400">Opacity:</span>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={style.boxOpacity}
                      onChange={(e) => updateStyle('boxOpacity', parseFloat(e.target.value))}
                      className="flex-1 accent-indigo-500 cursor-pointer"
                    />
                    <span className="font-mono text-xs text-white">
                      {Math.round(style.boxOpacity * 100)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================== CLIP TITLE TAB ===================== */}
      {activeTab === 'title' && (
        <div className="space-y-4">
          {/* Title Activation Switch */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-indigo-500/40 bg-indigo-950/20">
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <Heading className="w-4 h-4 text-indigo-400" />
                Enable Persistent Clip Title
              </div>
              <p className="text-[10px] text-zinc-400 mt-0.5">
                Displays a continuous title / headline across the clip (can be used alongside or instead of subtitles).
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer ml-3">
              <input
                type="checkbox"
                checked={clipTitle.enabled}
                onChange={(e) => updateTitle('enabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          {/* Title Text Input */}
          <div>
            <label className="block mb-1 text-xs font-semibold text-zinc-300">
              Title / Headline Text
            </label>
            <input
              type="text"
              value={clipTitle.text}
              onChange={(e) => updateTitle('text', e.target.value)}
              placeholder="e.g. 5 Daily Habits That Changed My Life"
              className="w-full px-3 py-2 text-xs text-white rounded-xl bg-zinc-950 border border-zinc-800 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Quick Positioning */}
          <div className="p-3 border rounded-xl bg-zinc-950/60 border-zinc-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-300">
              <span className="font-semibold">Vertical Placement</span>
              <span className="font-mono text-white">{clipTitle.positionY}%</span>
            </div>
            <div className="flex gap-2">
              {[
                { label: 'Top Header', val: 12 },
                { label: 'Mid-Top', val: 24 },
                { label: 'Center', val: 50 },
                { label: 'Bottom', val: 82 },
              ].map((pos) => (
                <button
                  key={pos.label}
                  onClick={() => updateTitle('positionY', pos.val)}
                  className={`flex-1 py-1 text-xs font-medium rounded border ${
                    clipTitle.positionY === pos.val
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                  }`}
                >
                  {pos.label}
                </button>
              ))}
            </div>
            <input
              type="range"
              min="5"
              max="95"
              value={clipTitle.positionY}
              onChange={(e) => updateTitle('positionY', parseInt(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
          </div>

          {/* Title Box Width / Spread */}
          <div className="p-3 border rounded-xl bg-zinc-950/60 border-zinc-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
                Title Box Width / Stretch
              </span>
              <span className="font-mono text-white text-xs">{clipTitle.boxWidth || 80}%</span>
            </div>
            <p className="text-[10px] text-zinc-400">
              Drag on screen or use slider to widen the title box and spread text horizontally.
            </p>
            <input
              type="range"
              min="25"
              max="100"
              value={clipTitle.boxWidth || 80}
              onChange={(e) => updateTitle('boxWidth', parseInt(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
          </div>

          {/* Title Font Size */}
          <div className="p-3 border rounded-xl bg-zinc-950/60 border-zinc-800 space-y-2">
            <div className="flex justify-between items-center text-xs text-zinc-400">
              <span className="font-semibold text-zinc-200">Title Size (px)</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="8"
                  max="96"
                  value={clipTitle.fontSize}
                  onChange={(e) => updateTitle('fontSize', Math.max(8, Math.min(96, parseInt(e.target.value) || 16)))}
                  className="w-14 px-1.5 py-0.5 text-center font-mono text-xs text-white bg-zinc-900 border border-zinc-700 rounded"
                />
                <span className="text-[11px] text-zinc-400">px</span>
              </div>
            </div>
            <input
              type="range"
              min="8"
              max="96"
              value={clipTitle.fontSize}
              onChange={(e) => updateTitle('fontSize', parseInt(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <div className="flex flex-wrap gap-1 pt-1">
              {[10, 12, 14, 16, 18, 22, 28, 36, 48].map((sz) => (
                <button
                  key={sz}
                  onClick={() => updateTitle('fontSize', sz)}
                  className={`px-1.5 py-0.5 text-[10px] font-mono rounded border transition-colors ${
                    clipTitle.fontSize === sz
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-zinc-800/80 text-zinc-400 border-zinc-700 hover:text-white'
                  }`}
                >
                  {sz}px
                </button>
              ))}
            </div>
          </div>

          {/* Title Font Selection */}
          <div>
            <label className="block mb-1 text-xs font-semibold text-zinc-300">
              Title Font
            </label>
            <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto pr-1">
              {AVAILABLE_FONTS.map((font) => {
                const isSelected = clipTitle.fontFamily === font.family;
                return (
                  <button
                    key={font.id}
                    onClick={() => updateTitle('fontFamily', font.family)}
                    className={`flex items-center justify-between p-2 rounded-lg border text-left transition-all ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500 text-white'
                        : 'bg-zinc-950/40 border-zinc-800/80 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold">{font.name}</div>
                      <div className="text-[10px] text-zinc-500">{font.tag}</div>
                    </div>
                    <div
                      style={{ fontFamily: font.family }}
                      className="text-sm font-bold text-zinc-200"
                    >
                      {font.previewText}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title Styling & Colors */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-2.5 border rounded-xl bg-zinc-950/60 border-zinc-800">
              <span className="block text-[11px] font-semibold text-zinc-300 mb-1.5">
                Text Color
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={clipTitle.textColor}
                  onChange={(e) => updateTitle('textColor', e.target.value)}
                  className="w-8 h-8 rounded border-none cursor-pointer bg-transparent"
                />
                <span className="font-mono text-xs text-zinc-200">{clipTitle.textColor}</span>
              </div>
            </div>

            <div className="p-2.5 border rounded-xl bg-zinc-950/60 border-zinc-800">
              <span className="block text-[11px] font-semibold text-zinc-300 mb-1.5">
                Outline / Stroke Color
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={clipTitle.strokeColor}
                  onChange={(e) => updateTitle('strokeColor', e.target.value)}
                  disabled={clipTitle.strokeWidth === 0}
                  className={`w-8 h-8 rounded border-none bg-transparent ${
                    clipTitle.strokeWidth === 0
                      ? 'opacity-40 cursor-not-allowed'
                      : 'cursor-pointer'
                  }`}
                />
                <span className="font-mono text-xs text-zinc-200">
                  {clipTitle.strokeWidth === 0 ? 'Disabled (0px)' : clipTitle.strokeColor}
                </span>
              </div>
            </div>
          </div>

          {/* Title Outline / Stroke Width Control */}
          <div className="p-3 border rounded-xl bg-zinc-950/60 border-zinc-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-200">Outline / Stroke Thickness</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={clipTitle.strokeWidth}
                  onChange={(e) => {
                    const val = Math.max(0, Math.min(20, parseInt(e.target.value) || 0));
                    updateTitle('strokeWidth', val);
                  }}
                  className="w-14 px-1.5 py-0.5 text-center font-mono text-xs text-white bg-zinc-900 border border-zinc-700 rounded"
                />
                <span className="text-[11px] text-zinc-400">px</span>
              </div>
            </div>

            <input
              type="range"
              min="0"
              max="16"
              step="1"
              value={clipTitle.strokeWidth}
              onChange={(e) => updateTitle('strokeWidth', parseInt(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />

            {/* Quick Stroke Width Buttons */}
            <div className="flex flex-wrap gap-1 pt-1">
              {[
                { label: '0px (None)', val: 0 },
                { label: '1px', val: 1 },
                { label: '2px', val: 2 },
                { label: '3px', val: 3 },
                { label: '4px', val: 4 },
                { label: '6px', val: 6 },
                { label: '8px', val: 8 },
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => updateTitle('strokeWidth', item.val)}
                  className={`px-2 py-0.5 text-[10px] font-mono rounded border transition-colors ${
                    clipTitle.strokeWidth === item.val
                      ? 'bg-indigo-600 text-white border-indigo-500 font-bold'
                      : 'bg-zinc-800/80 text-zinc-400 border-zinc-700 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title Drop Shadow */}
          <label className="flex items-center justify-between p-3 border rounded-xl bg-zinc-950/60 border-zinc-800 text-xs cursor-pointer">
            <span className="font-medium text-zinc-200">Title Drop Shadow</span>
            <input
              type="checkbox"
              checked={Boolean(clipTitle.shadow)}
              onChange={(e) => updateTitle('shadow', e.target.checked)}
              className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
            />
          </label>

          {/* Title Background Pill */}
          <div className="p-3 border rounded-xl bg-zinc-950/60 border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-200">Title Background Pill</span>
              <input
                type="checkbox"
                checked={clipTitle.boxBackground}
                onChange={(e) => updateTitle('boxBackground', e.target.checked)}
                className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
              />
            </div>
            {clipTitle.boxBackground && (
              <div className="pt-2 flex items-center justify-between gap-3 border-t border-zinc-800">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-zinc-400">Color:</span>
                  <input
                    type="color"
                    value={clipTitle.boxColor}
                    onChange={(e) => updateTitle('boxColor', e.target.value)}
                    className="w-6 h-6 rounded border-none cursor-pointer bg-transparent"
                  />
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-[11px] text-zinc-400">Opacity:</span>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={clipTitle.boxOpacity}
                    onChange={(e) => updateTitle('boxOpacity', parseFloat(e.target.value))}
                    className="flex-1 accent-indigo-500 cursor-pointer"
                  />
                  <span className="font-mono text-xs text-white">
                    {Math.round(clipTitle.boxOpacity * 100)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
