import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { Form, Input, type InputProps } from 'antd';

type ControlledTextInputProps<TFieldValues extends FieldValues> = InputProps & {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
};

export function ControlledTextInput<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  ...inputProps
}: ControlledTextInputProps<TFieldValues>) {
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
          <Input {...field} {...inputProps} />
        </Form.Item>
      )}
    />
  );
}
