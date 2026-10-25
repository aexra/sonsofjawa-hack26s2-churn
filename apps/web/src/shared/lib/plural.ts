const rules = new Intl.PluralRules('ru-RU');

interface PluralForms {
  one: string;
  few: string;
  many: string;
}

export const plural = (count: number, forms: PluralForms): string => {
  const category = rules.select(count);
  return category === 'one' ? forms.one : category === 'few' ? forms.few : forms.many;
};
