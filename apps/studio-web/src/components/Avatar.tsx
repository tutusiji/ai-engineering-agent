/**
 * Avatar — DiceBear 头像统一渲染组件
 *
 * 协议：{BASE}/{style}/svg?seed={seed}，URL 一律取后端下发的 avatarUrl 字段
 * （前端不参与协议拼接，切内网自建服务时前端零改动）。所有头像必须经本组件
 * 渲染、禁止裸 <img>：DiceBear SVG 自带大量留白，需要 .avatar-fill 的 CSS
 * 放大裁边（scale 固定 1.26、锚点 50% 26% 保头顶；scale 绝不放 URL——DiceBear
 * 9.x/10.x 的 scale 参数语义相反）；裁剪由父级 overflow-hidden 完成。
 *
 * 渲染策略：首字母兜底层始终在底层，<img> 叠加其上——加载失败/无 URL 时自然
 * 露出兜底，不需要额外的错误态管理。
 */

import { useState } from 'react';

interface AvatarProps {
  /** 头像地址（后端下发的 avatarUrl；空值或加载失败时渲染首字母兜底） */
  src?: string | null;
  /** 兜底首字母来源（一般传用户名） */
  name: string;
  /** 尺寸/圆角等类名，落在裁剪容器上 */
  className?: string;
}

export function Avatar({ src, name, className = '' }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* 兜底层：首字母 + 渐变底，与原 Header 胶囊的图标底色一致 */}
      <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-accent-500 to-violet-500 text-white font-semibold select-none">
        {initial}
        <span className="sr-only">{name}</span>
      </span>
      {/* 头像层：加载失败时移除，露出底层首字母 */}
      {src && !failed && (
        <img
          src={src}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="avatar-fill absolute inset-0 h-full w-full"
        />
      )}
    </div>
  );
}
