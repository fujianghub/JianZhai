import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import VideoEmbedView from './VideoEmbedView';

export interface VideoAttrs {
  src: string;
  platform: 'bilibili' | 'youtube' | 'other';
  videoId: string;
  title: string;
}

export function parseVideoUrl(url: string): (VideoAttrs & { iframeSrc: string }) | null {
  const trimmed = url.trim();

  const biliMatch = trimmed.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/i);
  if (biliMatch) {
    const videoId = biliMatch[1];
    return {
      src: trimmed,
      platform: 'bilibili',
      videoId,
      title: `Bilibili ${videoId}`,
      iframeSrc: `https://player.bilibili.com/player.html?bvid=${videoId}&page=1&high_quality=1&danmaku=0`,
    };
  }

  const ytMatch = trimmed.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    const videoId = ytMatch[1];
    return {
      src: trimmed,
      platform: 'youtube',
      videoId,
      title: `YouTube ${videoId}`,
      iframeSrc: `https://www.youtube.com/embed/${videoId}`,
    };
  }

  return null;
}

export const VideoEmbed = Node.create({
  name: 'videoEmbed',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: '' },
      platform: { default: 'other' },
      videoId: { default: '' },
      title: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-video-embed]',
        getAttrs(el) {
          const dom = el as HTMLElement;
          return {
            src: dom.getAttribute('data-src') ?? '',
            platform: dom.getAttribute('data-platform') ?? 'other',
            videoId: dom.getAttribute('data-video-id') ?? '',
            title: dom.getAttribute('data-title') ?? '',
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const { src, platform, videoId, title } = node.attrs as VideoAttrs;
    const parsed = parseVideoUrl(src);
    const iframeSrc = parsed?.iframeSrc ?? src ?? '';

    return [
      'div',
      mergeAttributes({
        'data-video-embed': '',
        'data-src': src,
        'data-platform': platform,
        'data-video-id': videoId,
        'data-title': title,
        class: 'jz-video-embed',
      }),
      [
        'iframe',
        {
          src: iframeSrc || 'about:blank',
          title: title || 'Video',
          frameborder: '0',
          allowfullscreen: 'true',
          allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
        },
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoEmbedView);
  },
});
