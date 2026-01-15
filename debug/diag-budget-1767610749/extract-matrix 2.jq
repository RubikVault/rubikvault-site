def pick(x): if x == null or x == "" then "-" else x end;

def entries:
  if (.data? and .data.entries? and (.data.entries|type)=="array") then .data.entries
  elif (.entries? and (.entries|type)=="array") then .entries
  else
    [ .. | objects | select(has("endpoint") and ((.endpoint|type)=="string")) ]
  end;

entries
| map({
    feature: (.feature // .name // .id // "-"),
    endpoint: (.endpoint // "-"),
    endpointStatus: (.endpointStatus // .status // "-"),
    metaStatus: (.meta.status // .metaStatus // "-"),
    metaReason: (.meta.reason // .metaReason // "-"),
    emptyReason: (.meta.emptyReason // .emptyReason // "-")
  })
| .[]
| [pick(.feature), pick(.endpoint), pick(.endpointStatus), pick(.metaStatus), pick(.metaReason), pick(.emptyReason)] | @tsv
