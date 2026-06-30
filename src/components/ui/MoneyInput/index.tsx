import { useEffect, useState, type ChangeEvent } from 'react';
import { Input, type InputProps } from 'antd';

import { formatIntegerInputValue, parseIntegerInputValue } from '@/utils';

type MoneyInputProps = Omit<InputProps, 'value' | 'onChange' | 'type'> & {
  max?: number;
  min?: number;
  onChange?: (value: number | null) => void;
  value?: number | null;
};

export function MoneyInput({ max, min, onChange, value, ...inputProps }: MoneyInputProps) {
  const [displayValue, setDisplayValue] = useState(() => formatIntegerInputValue(value));

  useEffect(() => {
    setDisplayValue(formatIntegerInputValue(value));
  }, [value]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const parsedValue = parseIntegerInputValue(event.target.value);

    if (!parsedValue) {
      setDisplayValue('');
      onChange?.(null);
      return;
    }

    const limitedValue = Math.min(
      typeof max === 'number' ? max : Number.MAX_SAFE_INTEGER,
      Math.max(typeof min === 'number' ? min : 0, parsedValue),
    );

    setDisplayValue(formatIntegerInputValue(limitedValue));
    onChange?.(limitedValue);
  }

  return <Input {...inputProps} inputMode="numeric" onChange={handleChange} value={displayValue} />;
}
