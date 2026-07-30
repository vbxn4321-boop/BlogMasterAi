-- 계정당 커스텀 프롬프트(custom_content_prompt) 1개 — 등급별 max_prompts를 초과해서
-- "커스텀 프롬프트가 켜진 계정 수"가 늘어나는 것을 막는 트리거.
-- naver_accounts 개수 제한 트리거(check_max_naver_accounts)와 동일한 패턴.
--
-- "새로 켜는" 경우에만 개수를 세고 막는다 — 이미 켜져 있던 계정의 문구를 수정하거나,
-- 끄는(빈 값으로 저장) 경우는 개수 증가가 아니므로 막지 않는다.
CREATE OR REPLACE FUNCTION check_max_custom_prompts()
RETURNS TRIGGER AS $$
DECLARE
    user_plan TEXT;
    user_override INTEGER;
    max_allowed INTEGER;
    current_count INTEGER;
    is_turning_on BOOLEAN;
BEGIN
    is_turning_on := (NEW.custom_content_prompt IS NOT NULL AND NEW.custom_content_prompt <> '')
                      AND (OLD.custom_content_prompt IS NULL OR OLD.custom_content_prompt = '');

    IF NOT is_turning_on THEN
        RETURN NEW;
    END IF;

    SELECT plan_type, override_max_prompts INTO user_plan, user_override
    FROM public.profiles WHERE id = NEW.user_id;

    IF user_plan = 'company' AND user_override IS NOT NULL THEN
        max_allowed := user_override;
    ELSE
        SELECT max_prompts INTO max_allowed FROM public.subscription_plans WHERE plan_key = user_plan;
    END IF;

    IF max_allowed IS NULL THEN
        RAISE EXCEPTION 'Your current plan does not allow custom prompts.';
    END IF;

    SELECT COUNT(*) INTO current_count FROM public.naver_accounts
    WHERE user_id = NEW.user_id
      AND custom_content_prompt IS NOT NULL AND custom_content_prompt <> ''
      AND id <> NEW.id;

    IF current_count >= max_allowed THEN
        RAISE EXCEPTION 'Maximum of % accounts with custom prompts allowed.', max_allowed;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_max_custom_prompts ON public.naver_accounts;
CREATE TRIGGER enforce_max_custom_prompts
    BEFORE UPDATE OF custom_content_prompt ON public.naver_accounts
    FOR EACH ROW EXECUTE FUNCTION check_max_custom_prompts();
