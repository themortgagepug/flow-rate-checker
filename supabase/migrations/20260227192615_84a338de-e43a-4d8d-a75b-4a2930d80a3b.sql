-- Add explicit deny SELECT policies on sensitive tables
CREATE POLICY "No public reads on mortgage_submissions"
ON public.mortgage_submissions
FOR SELECT
USING (false);

CREATE POLICY "No public reads on callback_requests"
ON public.callback_requests
FOR SELECT
USING (false);

CREATE POLICY "No public reads on result_views"
ON public.result_views
FOR SELECT
USING (false);