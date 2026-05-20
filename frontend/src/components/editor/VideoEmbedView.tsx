import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useState } from 'react';
import { Button, Input, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { parseVideoUrl } from './VideoEmbed';
import type { VideoAttrs } from './VideoEmbed';

export default function VideoEmbedView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const { src, platform, videoId, title } = node.attrs as VideoAttrs;
  const parsed = parseVideoUrl(src);
  const iframeSrc = parsed?.iframeSrc ?? src;

  const [editing, setEditing] = useState(!src);
  const [inputUrl, setInputUrl] = useState(src || '');
  const [urlError, setUrlError] = useState('');

  function handleConfirmUrl() {
    const p = parseVideoUrl(inputUrl);
    if (!p) {
      setUrlError('无法识别该链接，请粘贴 Bilibili 或 YouTube 的完整链接');
      return;
    }
    setUrlError('');
    updateAttributes({ src: p.src, platform: p.platform, videoId: p.videoId, title: p.title });
    setEditing(false);
  }

  const platformLabel =
    platform === 'bilibili' ? '哔哩哔哩' : platform === 'youtube' ? 'YouTube' : '视频';

  if (editing || !src) {
    return (
      <NodeViewWrapper>
        <div className="jz-video-input-box" contentEditable={false}>
          <div className="jz-video-input-header">
            <VideoCameraOutlined style={{ marginRight: 6 }} />
            嵌入视频
          </div>
          <Input
            value={inputUrl}
            onChange={(e) => { setInputUrl(e.target.value); setUrlError(''); }}
            placeholder="粘贴 Bilibili 或 YouTube 链接…"
            onPressEnter={handleConfirmUrl}
            status={urlError ? 'error' : undefined}
            autoFocus
            style={{ marginBottom: 6 }}
          />
          {urlError && <div className="jz-video-url-error">{urlError}</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <Button type="primary" size="small" onClick={handleConfirmUrl}>嵌入</Button>
            {src && (
              <Button size="small" onClick={() => { setEditing(false); setUrlError(''); }}>取消</Button>
            )}
            <Button size="small" danger onClick={deleteNode}>删除</Button>
          </div>
          <div className="jz-video-url-hint">
            支持：bilibili.com/video/BVxxx · youtu.be/xxx · youtube.com/watch?v=xxx
          </div>
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className={selected ? 'jz-video-selected' : ''}>
      <div className="jz-video-embed-card" contentEditable={false}>
        <div className="jz-video-embed-topbar">
          <span className="jz-video-platform-label">{platformLabel}</span>
          {videoId && <code className="jz-video-id">{videoId}</code>}
          <span style={{ flex: 1 }} />
          <Tooltip title="修改链接">
            <Button
              size="small"
              type="text"
              icon={<EditOutlined />}
              onClick={() => { setInputUrl(src); setEditing(true); }}
            />
          </Tooltip>
          <Tooltip title="删除">
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={deleteNode}
            />
          </Tooltip>
        </div>
        <div className="jz-video-frame-wrap">
          <iframe
            src={iframeSrc}
            title={title || 'Video'}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </NodeViewWrapper>
  );
}
