 = "d:\Projects\IS_SYSTEM\check_minuses_only.html"
 = "d:\Projects\IS_SYSTEM\check_minuses.html"

foreach ( in @(, )) {
     = [System.IO.File]::ReadAllText(, [System.Text.Encoding]::UTF8)

     = "if (r['Оператор'] !== 'СИСТЕМА (Експедиция)' && !(r['Оператор'] === 'СИСТЕМА (Корекция наличност)' && qty < 0) && op !== 'възстановен' && !op.startsWith('вложен в ')) { 
                            grossCompletedOps[key] = (grossCompletedOps[key] || 0) + qty; 
                          }
                          if (r['Оператор'] === 'СИСТЕМА (Ръчно добавен)' || (r['Оператор'] === 'СИСТЕМА (Корекция наличност)' && qty > 0)) {
                              manualOps[key] = (manualOps[key] || 0) + qty;
                          }"
     = "let isManual = (r['Оператор'] === 'СИСТЕМА (Ръчно добавен)' || (r['Оператор'] === 'СИСТЕМА (Корекция наличност)' && qty > 0));
                        if (isManual) {
                            manualOps[key] = (manualOps[key] || 0) + qty;
                        } else if (r['Оператор'] !== 'СИСТЕМА (Експедиция)' && !(r['Оператор'] === 'СИСТЕМА (Корекция наличност)' && qty < 0) && op !== 'възстановен' && !op.startsWith('вложен в ')) { 
                            grossCompletedOps[key] = (grossCompletedOps[key] || 0) + qty; 
                        }"
    
     = "let manualRequiredFromMe = manualOps[nextOpKey] || 0;
                        manualOps[opKey] = Math.max(manualOps[opKey] || 0, manualRequiredFromMe);"
     = "let manualRequiredFromMe = manualOps[nextOpKey] || 0;
                        manualOps[opKey] = (manualOps[opKey] || 0) + manualRequiredFromMe;"

     = "parentConsumed = Math.max(0, (grossStartedOps[firstOpKey] || 0) - (manualOps[firstOpKey] || 0));"
     = "parentConsumed = grossStartedOps[firstOpKey] || 0;"

     = "let myGrossDone = grossTrueDoneOps[opKey] || 0;"
     = "let myGrossDone = (grossTrueDoneOps[opKey] || 0) + (manualOps[opKey] || 0);"

     = .Replace(, )
     = .Replace(, )
     = .Replace(, )
     = .Replace(, )

    [System.IO.File]::WriteAllText(, , [System.Text.Encoding]::UTF8)
}
