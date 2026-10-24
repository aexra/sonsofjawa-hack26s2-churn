package team.jawa.churn.web;

import java.util.Collection;
import java.util.List;
import java.util.Set;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.TypeDescriptor;
import org.springframework.core.convert.converter.ConditionalConverter;
import org.springframework.core.convert.converter.ConditionalGenericConverter;
import org.springframework.core.convert.converter.Converter;
import org.springframework.core.convert.converter.ConverterFactory;
import org.springframework.format.FormatterRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
class WebConfig implements WebMvcConfigurer {

    private static final String GENERATED_MODELS = "team.jawa.churn.api.generated.model";

    @Override
    public void addFormatters(FormatterRegistry registry) {
        registry.addConverterFactory(new GeneratedEnumConverterFactory());
        registry.addConverter(new SingleValueListConverter());
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private static final class GeneratedEnumConverterFactory
            implements ConverterFactory<String, Enum>, ConditionalConverter {

        @Override
        public boolean matches(TypeDescriptor sourceType, TypeDescriptor targetType) {
            return targetType.getType().getPackageName().equals(GENERATED_MODELS);
        }

        @Override
        public <T extends Enum> Converter<String, T> getConverter(Class<T> targetType) {
            return source -> {
                for (T constant : targetType.getEnumConstants()) {
                    if (constant.toString().equals(source)) {
                        return constant;
                    }
                }
                throw new IllegalArgumentException("unknown value: " + source);
            };
        }
    }

    private static final class SingleValueListConverter implements ConditionalGenericConverter {

        @Override
        public Set<ConvertiblePair> getConvertibleTypes() {
            return Set.of(new ConvertiblePair(String.class, Collection.class));
        }

        @Override
        public boolean matches(TypeDescriptor sourceType, TypeDescriptor targetType) {
            TypeDescriptor element = targetType.getElementTypeDescriptor();
            return element != null && element.getType() == String.class;
        }

        @Override
        public Object convert(Object source, TypeDescriptor sourceType, TypeDescriptor targetType) {
            return source == null ? null : List.of((String) source);
        }
    }
}
