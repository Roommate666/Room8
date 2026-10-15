-- Audit P6 (15.10.): request_uni_code prueft Uni-Domain serverseitig (Allowlist gespiegelt
-- aus uni-domains.js). Vorher nur Blocklist -> jede Nicht-Freemail-Domain kam durch.
CREATE OR REPLACE FUNCTION public.request_uni_code(p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_email text; v_domain text; v_code text; v_url text; v_html text;
  v_win_start timestamptz; v_win_count int;
  v_blocked text[] := array['gmail.com','googlemail.com','gmx.de','gmx.net','web.de','yahoo.com','yahoo.de',
    'hotmail.com','hotmail.de','outlook.com','outlook.de','live.de','live.com','icloud.com','me.com',
    't-online.de','freenet.de','aol.com','proton.me','protonmail.com','mail.de'];
  v_known text[] := array['hnu.de','student.hnu.de','thu.de','student.thu.de','tum.de','mytum.de','lmu.de','campus.lmu.de','rwth-aachen.de','fau.de','kit.edu','rptu.de','hu-berlin.de','fu-berlin.de','charite.de','tu-darmstadt.de','kln.de','haw-hamburg.de','hcu-hamburg.de','macromedia.de','iubh.de','iu.org','srh.de','leuphana.de','jacobs-university.de','constructor.university','wiso.uni-hamburg.de','zhdk.ch','jku.at','wu.ac.at','fhwn.ac.at','fh-campuswien.ac.at','aau.at','plus.ac.at','meduniwien.ac.at','ethz.ch','student.ethz.ch','epfl.ch','uzh.ch','student.uzh.ch','unibas.ch','unibe.ch','students.unibe.ch','unil.ch','unige.ch','unifr.ch','unisg.ch','usi.ch','hslu.ch','zhaw.ch','fhnw.ch','bfh.ch','ost.ch','hsr.ch','akad.de','asfh-berlin.de','augustana.de','b-tu.de','ba-bautzen.de','bethel.de','bits-iserlohn.de','campus-m-university.de','campusm21.de','cbs.de','dhv-speyer.de','diploma.de','dshs-koeln.de','eba-muenchen.de','ebs.de','ecla.de','efh-bochum.de','efh-freiburg.de','efh-hannover.de','efh-reutlingen-ludwigsburg.de','efhlu.de','eh-darmstadt.de','ehs-dresden.de','ems-mainz.de','eufh.de','europa-uni.de','euv-frankfurt-o.de','evfh-berlin.de','evfh-nuernberg.de','fern-fh.de','fernuni-hagen.de','fhdw.bib.de','fhdw.de','fhkt.de','fhm-mittelstand.de','fhnon.de','fhoebb.de','fhs-mannheim.de','fhs-moritzburg.de','fht-stuttgart.de','fhtw-berlin.de','fhvr.berlin.de','fhw-berlin.de','fhwt.de','fom.de','fs-students.de','fs.de','h-brs.de','h-da.de','hanseuni.de','hdm-stuttgart.de','hertie-school.org','hfb.de','hff-muenchen.de','hfg-gmuend.de','hfk-bremen.de','hfk2020.de','hfm-detmold.de','hfmdd.de','hfmt-koeln.de','hfp.mhn.de','hfph.mwn.de','hhl.de','hhu.de','himh.de','hmdk-stuttgart.de','hmt-leipzig.de','hmtm-hannover.de','hmtm.de','hochschule-bonn-rhein-sieg.de','hwg-lu.de','hwp-hamburg.de','i-u.de','ihi-zittau.de','ism-dortmund.de','isnm.de','ist-hochschule.de','iubh-fernstudium.de','karlshochschule.de','kath-fh-nord.de','kfb-berlin.de','kfh-freiburg.de','kfh-mainz.de','kfhnw.de','kh-berlin.de','khsa.de','ksbk-do.de','ksfh.de','ku-eichstaett.de','kunstakademie-duesseldorf.de','merkur-fh.org','merz-akademie.de','mfh-iserlohn.de','mh-hannover.de','mh-luebeck.de','mh-trossingen.de','mu-luebeck.de','musikhochschule-muenchen.de','muthesius.de','nordakademie.de','ostfalia.de','oth-aw.de','paderborn.de','pfh-goettingen.de','philtheol-augustin.de','popakademie.de','privatfh-da.de','pth-bb.de','pth-muenster.de','pthv.de','rauheshaus.de','rfh-koeln.de','ruhr-uni-bochum.de','selk.de','siewerth-akademie.de','siu-heidelberg.de','srh-berlin.de','stw.de','tfh-berlin.de','tfh-bochum.de','tfh-wildau.de','tha.de','thh-friedensau.de','thi.de','thm.de','tiho-hannover.de','tuhh.de','udk-berlin.de','unibw-hamburg.de','unibw-muenchen.de','uol.de','w-hs.de','whu-koblenz.de','wwu.de'];
begin
  if v_uid is null then return jsonb_build_object('ok',false,'error','NOT_AUTHENTICATED'); end if;
  perform set_config('app.verify_write','on',true);
  v_email := lower(trim(p_email));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok',false,'error','INVALID_EMAIL'); end if;
  v_domain := split_part(v_email,'@',2);
  if v_domain = any(v_blocked) then return jsonb_build_object('ok',false,'error','NOT_UNI_EMAIL'); end if;
  -- Allowlist (gespiegelt aus uni-domains.js): akad. Muster ODER kuratierte Hochschul-Liste, sonst Doku-Upload
  if not (v_domain ~ '(^|\.)uni-[a-z-]+\.de$' or v_domain ~ '(^|\.)tu-[a-z-]+\.de$' or v_domain ~ '(^|\.)th-[a-z-]+\.de$' or v_domain ~ '(^|\.)fh-[a-z-]+\.de$' or v_domain ~ '(^|\.)hs-[a-z-]+\.de$' or v_domain ~ '(^|\.)htw-?[a-z-]*\.de$' or v_domain ~ '(^|\.)hwr-[a-z-]+\.de$' or v_domain ~ '(^|\.)hsw?-?[a-z-]*\.de$' or v_domain ~ '\.hochschule(-[a-z]+)?\.de$' or v_domain ~ '(^|\.)dhbw[a-z-]*\.de$' or v_domain ~ '(^|\.)ph-[a-z-]+\.de$' or v_domain ~ '(^|\.)(stud|student)\.[a-z0-9.-]+\.[a-z]{2,3}$' or v_domain ~ '\.edu$' or v_domain ~ '\.edu\.[a-z]{2,3}$' or v_domain ~ '\.ac\.at$' or v_domain ~ '\.ac\.uk$' or v_domain ~ '\.ac\.[a-z]{2}$' or v_domain = any(array['hnu.de','student.hnu.de','thu.de','student.thu.de','tum.de','mytum.de','lmu.de','campus.lmu.de','rwth-aachen.de','fau.de','kit.edu','rptu.de','hu-berlin.de','fu-berlin.de','charite.de','tu-darmstadt.de','kln.de','haw-hamburg.de','hcu-hamburg.de','macromedia.de','iubh.de','iu.org','srh.de','leuphana.de','jacobs-university.de','constructor.university','wiso.uni-hamburg.de','zhdk.ch','jku.at','wu.ac.at','fhwn.ac.at','fh-campuswien.ac.at','aau.at','plus.ac.at','meduniwien.ac.at','ethz.ch','student.ethz.ch','epfl.ch','uzh.ch','student.uzh.ch','unibas.ch','unibe.ch','students.unibe.ch','unil.ch','unige.ch','unifr.ch','unisg.ch','usi.ch','hslu.ch','zhaw.ch','fhnw.ch','bfh.ch','ost.ch','hsr.ch','akad.de','asfh-berlin.de','augustana.de','b-tu.de','ba-bautzen.de','bethel.de','bits-iserlohn.de','campus-m-university.de','campusm21.de','cbs.de','dhv-speyer.de','diploma.de','dshs-koeln.de','eba-muenchen.de','ebs.de','ecla.de','efh-bochum.de','efh-freiburg.de','efh-hannover.de','efh-reutlingen-ludwigsburg.de','efhlu.de','eh-darmstadt.de','ehs-dresden.de','ems-mainz.de','eufh.de','europa-uni.de','euv-frankfurt-o.de','evfh-berlin.de','evfh-nuernberg.de','fern-fh.de','fernuni-hagen.de','fhdw.bib.de','fhdw.de','fhkt.de','fhm-mittelstand.de','fhnon.de','fhoebb.de','fhs-mannheim.de','fhs-moritzburg.de','fht-stuttgart.de','fhtw-berlin.de','fhvr.berlin.de','fhw-berlin.de','fhwt.de','fom.de','fs-students.de','fs.de','h-brs.de','h-da.de','hanseuni.de','hdm-stuttgart.de','hertie-school.org','hfb.de','hff-muenchen.de','hfg-gmuend.de','hfk-bremen.de','hfk2020.de','hfm-detmold.de','hfmdd.de','hfmt-koeln.de','hfp.mhn.de','hfph.mwn.de','hhl.de','hhu.de','himh.de','hmdk-stuttgart.de','hmt-leipzig.de','hmtm-hannover.de','hmtm.de','hochschule-bonn-rhein-sieg.de','hwg-lu.de','hwp-hamburg.de','i-u.de','ihi-zittau.de','ism-dortmund.de','isnm.de','ist-hochschule.de','iubh-fernstudium.de','karlshochschule.de','kath-fh-nord.de','kfb-berlin.de','kfh-freiburg.de','kfh-mainz.de','kfhnw.de','kh-berlin.de','khsa.de','ksbk-do.de','ksfh.de','ku-eichstaett.de','kunstakademie-duesseldorf.de','merkur-fh.org','merz-akademie.de','mfh-iserlohn.de','mh-hannover.de','mh-luebeck.de','mh-trossingen.de','mu-luebeck.de','musikhochschule-muenchen.de','muthesius.de','nordakademie.de','ostfalia.de','oth-aw.de','paderborn.de','pfh-goettingen.de','philtheol-augustin.de','popakademie.de','privatfh-da.de','pth-bb.de','pth-muenster.de','pthv.de','rauheshaus.de','rfh-koeln.de','ruhr-uni-bochum.de','selk.de','siewerth-akademie.de','siu-heidelberg.de','srh-berlin.de','stw.de','tfh-berlin.de','tfh-bochum.de','tfh-wildau.de','tha.de','thh-friedensau.de','thi.de','thm.de','tiho-hannover.de','tuhh.de','udk-berlin.de','unibw-hamburg.de','unibw-muenchen.de','uol.de','w-hs.de','whu-koblenz.de','wwu.de'])) then return jsonb_build_object('ok',false,'error','NOT_UNI_EMAIL'); end if;
  if exists (select 1 from public.profiles where lower(uni_email)=v_email and uni_email_verified=true and id<>v_uid) then
    return jsonb_build_object('ok',false,'error','EMAIL_IN_USE'); end if;

  select uni_code_window_start, uni_code_window_count into v_win_start, v_win_count
    from public.profiles where id = v_uid;
  if v_win_start is null or v_win_start < now() - interval '10 minutes' then
    update public.profiles set uni_code_window_start = now(), uni_code_window_count = 1 where id = v_uid;
  elsif coalesce(v_win_count,0) >= 3 then
    return jsonb_build_object('ok',false,'error','RATE_LIMITED',
      'retry_after_sec', greatest(1, 600 - floor(extract(epoch from (now() - v_win_start)))::int));
  else
    update public.profiles set uni_code_window_count = coalesce(uni_code_window_count,0) + 1 where id = v_uid;
  end if;

  v_code := lpad((floor(random()*1000000))::int::text, 6, '0');
  update public.profiles set uni_email=v_email, uni_email_verification_token=v_code, uni_email_token_created_at=now()
    where id=v_uid;

  v_url := coalesce(current_setting('app.supabase_url',true),'https://tvnvmogaqmduzcycmvby.supabase.co')||'/functions/v1/send-email';
  v_html := '<h2 style="margin:0 0 12px;font-size:22px;">Dein UniGoat-Code</h2>'
    ||'<p style="margin:0 0 8px;">Gib diesen Code in der App ein, um deinen Studenten-Status zu bestätigen:</p>'
    ||'<div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#f4f6f8;border-radius:12px;padding:16px;text-align:center;margin:12px 0;">'||v_code||'</div>'
    ||'<p style="margin:0;color:#6b7280;font-size:13px;">Der Code ist 30 Minuten gültig. Wenn du das nicht warst, ignoriere diese Mail.</p>';
  begin
    perform net.http_post(url:=v_url, headers:=public.app_internal_headers(),
      body:=jsonb_build_object('to',v_email,'subject','Dein UniGoat-Code: '||v_code,'html',v_html,'userId',v_uid));
  exception when others then raise warning 'uni code mail fail %: %',v_uid,sqlerrm; end;
  return jsonb_build_object('ok',true);
end; $function$;
