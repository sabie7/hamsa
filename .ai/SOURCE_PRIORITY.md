# SOURCE PRIORITY

1. scraped_decoded/
   Legacy business logic.

2. sor/
   Missing recovered features.

3. deobfuscated_source/
   Readable reconstructed implementation.

4. client/
5. src/

The runtime application must merge the best implementation from every source.

Never leave deobfuscated_source unused.

Never assume one source is complete.