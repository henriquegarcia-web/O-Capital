import { Avatar, Flex, Form, Radio, Tooltip } from 'antd';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

import { PROFILE_PHOTOS } from '@/constants';

type ControlledProfilePhotoSelectProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
};

export function ControlledProfilePhotoSelect<TFieldValues extends FieldValues>({
  control,
  name,
  label,
}: ControlledProfilePhotoSelectProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item label={label} validateStatus={fieldState.error ? 'error' : undefined}>
          <Radio.Group {...field} className="profile-options-group">
            <Flex wrap="wrap" gap={8} className="profile-options-grid">
              {PROFILE_PHOTOS.map((photo) => (
                <Tooltip key={photo.key} title={photo.label}>
                  <Radio.Button value={photo.key} className="profile-photo-option">
                    <Avatar size={32} src={photo.path}>
                      {photo.label.charAt(0)}
                    </Avatar>
                  </Radio.Button>
                </Tooltip>
              ))}
            </Flex>
          </Radio.Group>
        </Form.Item>
      )}
    />
  );
}
