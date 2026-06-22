import { LockOutlined } from '@ant-design/icons';
import { Flex, Form, Radio, Tooltip } from 'antd';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';

import { PROFILE_COLORS } from '@/constants';

type ControlledProfileColorSelectProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  disabledColorKeys?: string[];
  name: FieldPath<TFieldValues>;
  label: string;
};

export function ControlledProfileColorSelect<TFieldValues extends FieldValues>({
  control,
  disabledColorKeys = [],
  name,
  label,
}: ControlledProfileColorSelectProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item
          label={label}
          validateStatus={fieldState.error ? 'error' : undefined}
          help={fieldState.error?.message}
        >
          <Radio.Group {...field} className="profile-options-group">
            <Flex wrap="wrap" gap={8} className="profile-options-grid">
              {PROFILE_COLORS.map((color) => {
                const isDisabled = disabledColorKeys.includes(color.key);

                return (
                  <Tooltip key={color.key} title={color.label}>
                    <Radio.Button
                      value={color.key}
                      disabled={isDisabled}
                      className="profile-color-option"
                      style={{
                        backgroundColor: color.value,
                        borderColor: color.value,
                      }}
                    >
                      {isDisabled ? <LockOutlined className="profile-color-option__lock" /> : null}
                      <span className="profile-color-option__label">{color.label}</span>
                    </Radio.Button>
                  </Tooltip>
                );
              })}
            </Flex>
          </Radio.Group>
        </Form.Item>
      )}
    />
  );
}
