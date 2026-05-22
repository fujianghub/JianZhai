/** 内嵌 emoji 列表 — 不依赖外部库。常用 200+ 个，按主题分组。
 *  关键字均英文小写，方便 `:hap` → 😀 这类前缀匹配。
 *  字段 keywords 是多语言别名（含中文同义词）。
 */

export interface EmojiEntry {
  /** 显示用字符 */
  emoji: string;
  /** 主名（用于命令显示） */
  name: string;
  /** 触发匹配的关键字（英文 + 中文同义词） */
  keywords: string[];
  /** 分组（用于不输入时分类展示） */
  group: '常用' | '表情' | '人物' | '动物' | '食物' | '活动' | '物品' | '符号';
}

export const EMOJI_LIST: EmojiEntry[] = [
  // 常用
  { emoji: '👍', name: 'thumbs up', keywords: ['+1', 'like', 'good', '赞', '好', '点赞'], group: '常用' },
  { emoji: '👎', name: 'thumbs down', keywords: ['-1', 'dislike', 'bad', '差评', '不好'], group: '常用' },
  { emoji: '✅', name: 'check', keywords: ['done', 'check', 'ok', '完成', '对', '通过'], group: '常用' },
  { emoji: '❌', name: 'cross', keywords: ['fail', 'no', 'wrong', '错', '失败'], group: '常用' },
  { emoji: '⚠️', name: 'warning', keywords: ['warn', '警告', '注意'], group: '常用' },
  { emoji: '💡', name: 'idea', keywords: ['bulb', 'idea', '想法', '灵感'], group: '常用' },
  { emoji: '🔥', name: 'fire', keywords: ['hot', 'fire', '火', '热'], group: '常用' },
  { emoji: '⭐', name: 'star', keywords: ['star', '星', '收藏'], group: '常用' },
  { emoji: '❤️', name: 'heart', keywords: ['love', 'heart', '爱', '心'], group: '常用' },
  { emoji: '🎉', name: 'party', keywords: ['celebrate', 'party', '庆祝', '撒花'], group: '常用' },
  { emoji: '🚀', name: 'rocket', keywords: ['launch', 'rocket', '火箭', '发射', '上线'], group: '常用' },
  { emoji: '🐛', name: 'bug', keywords: ['bug', 'issue', '虫', '问题'], group: '常用' },
  { emoji: '📝', name: 'memo', keywords: ['note', 'memo', '笔记', '备忘'], group: '常用' },
  { emoji: '🔗', name: 'link', keywords: ['link', '链接'], group: '常用' },
  { emoji: '📌', name: 'pin', keywords: ['pin', 'fix', '固定', '钉'], group: '常用' },
  { emoji: '🎯', name: 'target', keywords: ['target', 'goal', '目标', '靶'], group: '常用' },

  // 表情
  { emoji: '😀', name: 'grinning', keywords: ['happy', 'grin', '开心', '笑'], group: '表情' },
  { emoji: '😄', name: 'smile', keywords: ['smile', 'happy', '高兴', '笑'], group: '表情' },
  { emoji: '😅', name: 'sweat smile', keywords: ['sweat', 'smile', '汗', '尬笑'], group: '表情' },
  { emoji: '😂', name: 'joy', keywords: ['cry', 'laugh', '笑哭', '哭笑'], group: '表情' },
  { emoji: '🤣', name: 'rofl', keywords: ['lol', 'rofl', '笑死', '哈哈'], group: '表情' },
  { emoji: '😊', name: 'blush', keywords: ['shy', 'blush', '害羞', '微笑'], group: '表情' },
  { emoji: '😍', name: 'heart eyes', keywords: ['love', '爱心', '心动'], group: '表情' },
  { emoji: '🤔', name: 'thinking', keywords: ['think', 'hmm', '思考', '想'], group: '表情' },
  { emoji: '😎', name: 'cool', keywords: ['cool', 'sunglasses', '酷', '墨镜'], group: '表情' },
  { emoji: '🥲', name: 'tear', keywords: ['tear', 'sad', '感动', '泪'], group: '表情' },
  { emoji: '😢', name: 'cry', keywords: ['cry', 'sad', '哭', '伤心'], group: '表情' },
  { emoji: '😭', name: 'sob', keywords: ['sob', 'cry', '大哭', '泪奔'], group: '表情' },
  { emoji: '😤', name: 'huff', keywords: ['mad', 'huff', '生气', '怒'], group: '表情' },
  { emoji: '😡', name: 'angry', keywords: ['mad', 'angry', '怒', '愤怒'], group: '表情' },
  { emoji: '🤯', name: 'mind blown', keywords: ['shock', 'mind', '炸裂', '震惊'], group: '表情' },
  { emoji: '😴', name: 'sleep', keywords: ['sleep', 'tired', '困', '睡'], group: '表情' },
  { emoji: '🥱', name: 'yawn', keywords: ['yawn', 'tired', '困', '哈欠'], group: '表情' },
  { emoji: '🤒', name: 'sick', keywords: ['sick', 'fever', '生病', '发烧'], group: '表情' },
  { emoji: '😷', name: 'mask', keywords: ['mask', 'sick', '口罩'], group: '表情' },
  { emoji: '🤡', name: 'clown', keywords: ['clown', 'joker', '小丑'], group: '表情' },

  // 人物 / 手势
  { emoji: '👋', name: 'wave', keywords: ['hi', 'hello', '挥手', '打招呼'], group: '人物' },
  { emoji: '🙏', name: 'pray', keywords: ['thanks', 'please', 'pray', '感谢', '请', '拜托'], group: '人物' },
  { emoji: '👏', name: 'clap', keywords: ['clap', 'applause', '鼓掌', '掌声'], group: '人物' },
  { emoji: '🤝', name: 'handshake', keywords: ['deal', 'shake', '握手', '合作'], group: '人物' },
  { emoji: '✊', name: 'fist', keywords: ['fist', 'power', '加油', '拳'], group: '人物' },
  { emoji: '👀', name: 'eyes', keywords: ['look', 'watch', '眼睛', '看'], group: '人物' },
  { emoji: '🧑‍💻', name: 'developer', keywords: ['dev', 'code', '程序员', '开发'], group: '人物' },
  { emoji: '👨‍💼', name: 'office worker', keywords: ['work', 'office', '上班', '白领'], group: '人物' },

  // 动物
  { emoji: '🐱', name: 'cat', keywords: ['cat', 'kitty', '猫'], group: '动物' },
  { emoji: '🐶', name: 'dog', keywords: ['dog', 'puppy', '狗'], group: '动物' },
  { emoji: '🦊', name: 'fox', keywords: ['fox', '狐狸'], group: '动物' },
  { emoji: '🐼', name: 'panda', keywords: ['panda', '熊猫'], group: '动物' },
  { emoji: '🦄', name: 'unicorn', keywords: ['unicorn', '独角兽'], group: '动物' },
  { emoji: '🐉', name: 'dragon', keywords: ['dragon', '龙'], group: '动物' },
  { emoji: '🦁', name: 'lion', keywords: ['lion', '狮子'], group: '动物' },

  // 食物
  { emoji: '🍕', name: 'pizza', keywords: ['pizza', '披萨'], group: '食物' },
  { emoji: '🍔', name: 'burger', keywords: ['burger', '汉堡'], group: '食物' },
  { emoji: '🍜', name: 'noodles', keywords: ['noodles', 'ramen', '面', '拉面'], group: '食物' },
  { emoji: '🍣', name: 'sushi', keywords: ['sushi', '寿司'], group: '食物' },
  { emoji: '🍰', name: 'cake', keywords: ['cake', '蛋糕'], group: '食物' },
  { emoji: '🍵', name: 'tea', keywords: ['tea', '茶'], group: '食物' },
  { emoji: '☕', name: 'coffee', keywords: ['coffee', '咖啡'], group: '食物' },
  { emoji: '🍺', name: 'beer', keywords: ['beer', '啤酒'], group: '食物' },
  { emoji: '🍷', name: 'wine', keywords: ['wine', '红酒'], group: '食物' },
  { emoji: '🥃', name: 'whisky', keywords: ['whisky', '威士忌'], group: '食物' },

  // 活动 / 工作
  { emoji: '⚡', name: 'lightning', keywords: ['fast', 'zap', '快', '闪电'], group: '活动' },
  { emoji: '🏆', name: 'trophy', keywords: ['trophy', 'win', '奖杯', '胜利'], group: '活动' },
  { emoji: '🎁', name: 'gift', keywords: ['gift', 'present', '礼物'], group: '活动' },
  { emoji: '🎓', name: 'graduation', keywords: ['grad', '毕业'], group: '活动' },
  { emoji: '📚', name: 'books', keywords: ['books', 'study', '书', '学习'], group: '活动' },
  { emoji: '📖', name: 'book', keywords: ['book', '书', '读'], group: '活动' },
  { emoji: '✏️', name: 'pencil', keywords: ['edit', 'pencil', '笔', '编辑'], group: '活动' },
  { emoji: '🔍', name: 'search', keywords: ['search', 'find', '搜索', '查找'], group: '活动' },
  { emoji: '🔒', name: 'lock', keywords: ['lock', 'secure', '锁', '安全'], group: '活动' },
  { emoji: '🔓', name: 'unlock', keywords: ['unlock', '开锁'], group: '活动' },
  { emoji: '🔑', name: 'key', keywords: ['key', '钥匙'], group: '活动' },

  // 物品 / 技术
  { emoji: '💻', name: 'laptop', keywords: ['code', 'laptop', '电脑'], group: '物品' },
  { emoji: '📱', name: 'phone', keywords: ['phone', '手机'], group: '物品' },
  { emoji: '🖱️', name: 'mouse', keywords: ['mouse', '鼠标'], group: '物品' },
  { emoji: '⌨️', name: 'keyboard', keywords: ['keyboard', '键盘'], group: '物品' },
  { emoji: '💾', name: 'floppy', keywords: ['save', 'disk', '保存', '软盘'], group: '物品' },
  { emoji: '💿', name: 'cd', keywords: ['cd', '光盘'], group: '物品' },
  { emoji: '📷', name: 'camera', keywords: ['camera', '相机', '拍照'], group: '物品' },
  { emoji: '🎥', name: 'video', keywords: ['video', 'movie', '视频'], group: '物品' },
  { emoji: '🎵', name: 'music', keywords: ['music', 'note', '音乐'], group: '物品' },
  { emoji: '⏰', name: 'clock', keywords: ['clock', 'time', '时钟', '时间'], group: '物品' },
  { emoji: '⏳', name: 'hourglass', keywords: ['wait', 'time', '沙漏', '等待'], group: '物品' },
  { emoji: '📅', name: 'calendar', keywords: ['date', 'calendar', '日历'], group: '物品' },
  { emoji: '📊', name: 'chart', keywords: ['chart', 'stats', '图表', '统计'], group: '物品' },
  { emoji: '📈', name: 'up', keywords: ['up', 'growth', '上升', '增长'], group: '物品' },
  { emoji: '📉', name: 'down', keywords: ['down', 'decline', '下降'], group: '物品' },

  // 符号
  { emoji: '✨', name: 'sparkles', keywords: ['shine', 'new', '闪光', '亮'], group: '符号' },
  { emoji: '💯', name: '100', keywords: ['100', 'perfect', '满分'], group: '符号' },
  { emoji: '➡️', name: 'right', keywords: ['arrow', 'right', '右', '箭头'], group: '符号' },
  { emoji: '⬅️', name: 'left', keywords: ['arrow', 'left', '左'], group: '符号' },
  { emoji: '⬆️', name: 'up', keywords: ['arrow', 'up', '上'], group: '符号' },
  { emoji: '⬇️', name: 'down', keywords: ['arrow', 'down', '下'], group: '符号' },
  { emoji: '↩️', name: 'return', keywords: ['return', 'back', '返回'], group: '符号' },
  { emoji: '🔄', name: 'refresh', keywords: ['refresh', 'reload', '刷新'], group: '符号' },
  { emoji: '🔔', name: 'bell', keywords: ['bell', 'notify', '铃', '通知'], group: '符号' },
  { emoji: '🚨', name: 'siren', keywords: ['alarm', 'urgent', '警报', '紧急'], group: '符号' },
  { emoji: '💬', name: 'speech', keywords: ['chat', 'talk', '对话'], group: '符号' },
  { emoji: '💭', name: 'thought', keywords: ['think', 'thought', '想'], group: '符号' },
  { emoji: '☑️', name: 'check box', keywords: ['check', 'todo', '勾选'], group: '符号' },
  { emoji: '◽', name: 'square', keywords: ['box', '方块'], group: '符号' },
  { emoji: '🔴', name: 'red circle', keywords: ['red', 'circle', '红圆'], group: '符号' },
  { emoji: '🟢', name: 'green circle', keywords: ['green', 'circle', '绿圆'], group: '符号' },
  { emoji: '🟡', name: 'yellow circle', keywords: ['yellow', '黄圆'], group: '符号' },
  { emoji: '🔵', name: 'blue circle', keywords: ['blue', '蓝圆'], group: '符号' },
];

/** 模糊匹配：按 name + keywords，前缀优先 */
export function searchEmoji(query: string, limit = 40): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return EMOJI_LIST.slice(0, limit);
  const prefixMatches: EmojiEntry[] = [];
  const containsMatches: EmojiEntry[] = [];
  for (const e of EMOJI_LIST) {
    const hay = [e.name, ...e.keywords];
    if (hay.some((s) => s.toLowerCase().startsWith(q))) {
      prefixMatches.push(e);
    } else if (hay.some((s) => s.toLowerCase().includes(q))) {
      containsMatches.push(e);
    }
    if (prefixMatches.length + containsMatches.length >= limit) break;
  }
  return [...prefixMatches, ...containsMatches].slice(0, limit);
}
