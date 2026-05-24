import { useState } from 'react';
import { Button, Card, Space, Typography, Upload } from 'antd';
import type { UploadFile, RcFile } from 'antd/es/upload';
import ImgCrop from 'antd-img-crop';
import { DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import * as authApi from '@/api/auth';
import { formatApiError } from '@/api/client';
import { message } from '@/utils/notify';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import UserAvatar from '@/components/common/UserAvatar';
import { useAuthStore } from '@/stores/auth';

const { Text } = Typography;

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const loadSession = useAuthStore((s) => s.loadSession);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  if (!user) return null;

  async function handleSave() {
    if (!pendingFile) {
      message.warning('请先选择并裁剪头像');
      return;
    }
    setUploading(true);
    try {
      await authApi.uploadAvatar(pendingFile);
      await loadSession();
      setPendingFile(null);
      setFileList([]);
      message.success('头像已更新');
    } catch (err) {
      message.error(formatApiError(err, '上传失败'));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setUploading(true);
    try {
      await authApi.deleteAvatar();
      await loadSession();
      setPendingFile(null);
      setFileList([]);
      message.success('已恢复默认头像');
    } catch (err) {
      message.error(formatApiError(err, '移除失败'));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <AdminPageHeader title="个人资料" backTo="/admin/kbs" backLabel="知识库" />
      <Card className="jz-profile-card">
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <UserAvatar user={user} size={72} />
            <div>
              <Text strong style={{ fontSize: 16 }}>
                {user.username}
              </Text>
              <br />
              <Text type="secondary" style={{ fontSize: 13 }}>
                支持 JPEG / PNG / WebP / GIF，最大 5MB，将自动裁剪为圆形
              </Text>
            </div>
          </div>

          <ImgCrop rotationSlider cropShape="round" aspect={1} quality={0.92}>
            <Upload
              listType="picture-circle"
              maxCount={1}
              fileList={fileList}
              accept="image/jpeg,image/png,image/webp,image/gif"
              beforeUpload={(file: RcFile) => {
                setPendingFile(file);
                setFileList([
                  {
                    uid: '-1',
                    name: file.name,
                    status: 'done',
                    originFileObj: file,
                  },
                ]);
                return false;
              }}
              onRemove={() => {
                setPendingFile(null);
                setFileList([]);
              }}
            >
              <button type="button" style={{ border: 0, background: 'none' }}>
                <UploadOutlined />
                <div style={{ marginTop: 8 }}>选择图片</div>
              </button>
            </Upload>
          </ImgCrop>

          <Space>
            <Button type="primary" loading={uploading} onClick={() => void handleSave()}>
              保存头像
            </Button>
            <Button
              icon={<DeleteOutlined />}
              loading={uploading}
              disabled={!user.avatar_url && !pendingFile}
              onClick={() => void handleRemove()}
            >
              移除头像
            </Button>
          </Space>
        </Space>
      </Card>
    </div>
  );
}
