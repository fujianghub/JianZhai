import { Form, Radio, Select, Typography } from 'antd';

const { Text } = Typography;

interface UserOption {
  id: number;
  username: string;
}
interface TagOption {
  id: number;
  name: string;
}

interface Props {
  /** Reader accounts that can be individually targeted. */
  users: UserOption[];
  /** User tags that can be targeted as a group. */
  tags: TagOption[];
}

/**
 * WeChat-Moments-style audience picker for a KB / category form. Renders three
 * Form.Items bound to ``audience_mode`` / ``audience_user_ids`` /
 * ``audience_tag_ids`` — drop inside an AntD ``<Form>``. The user/tag selects
 * only show when the mode is not "全员可见".
 */
export default function AudienceControl({ users, tags }: Props) {
  const userOptions = users.map((u) => ({ value: u.id, label: u.username }));
  const tagOptions = tags.map((t) => ({ value: t.id, label: t.name }));

  return (
    <>
      <Form.Item
        label="可见范围"
        name="audience_mode"
        initialValue="all"
        extra="仅对读者（普通用户 / 匿名访客）生效；管理员（作者）始终可见全部内容。"
      >
        <Radio.Group>
          <Radio.Button value="all">全员可见</Radio.Button>
          <Radio.Button value="exclude">部分不可见</Radio.Button>
          <Radio.Button value="include">仅部分可见</Radio.Button>
        </Radio.Group>
      </Form.Item>
      <Form.Item
        noStyle
        shouldUpdate={(prev, cur) => prev.audience_mode !== cur.audience_mode}
      >
        {({ getFieldValue }) => {
          const mode = getFieldValue('audience_mode');
          if (!mode || mode === 'all') return null;
          const hint =
            mode === 'exclude'
              ? '下列用户 / 标签将看不到它，其余读者照常可见。'
              : '只有下列用户 / 标签能看到它，其余读者一律隐藏。';
          return (
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: 'var(--jz-fill, rgba(0,0,0,0.02))',
                marginBottom: 16,
              }}
            >
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                {hint}
              </Text>
              <Form.Item label="指定用户" name="audience_user_ids" style={{ marginBottom: 12 }}>
                <Select
                  mode="multiple"
                  allowClear
                  placeholder="选择用户"
                  optionFilterProp="label"
                  options={userOptions}
                />
              </Form.Item>
              <Form.Item label="指定标签" name="audience_tag_ids" style={{ marginBottom: 0 }}>
                <Select
                  mode="multiple"
                  allowClear
                  placeholder="选择标签"
                  optionFilterProp="label"
                  options={tagOptions}
                />
              </Form.Item>
            </div>
          );
        }}
      </Form.Item>
    </>
  );
}
